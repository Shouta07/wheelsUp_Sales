/**
 * Google Drive API クライアント (Service Account 認証)。
 *
 * 外部 SDK 依存なしで動かすため、JWT を node:crypto で自前署名 → OAuth トークン
 * を交換 → Drive REST API を fetch で叩く方式。
 *
 * 必要な ENV:
 *   GOOGLE_SA_EMAIL          - サービスアカウントのメールアドレス
 *   GOOGLE_SA_PRIVATE_KEY    - PEM 形式の秘密鍵。改行は \n でエスケープして OK
 *   MIMO_DRIVE_FOLDER_ID     - 監視対象フォルダ ID
 *
 * Service Account のセットアップ手順:
 *  1. GCP コンソールで Service Account 作成 → JSON キー発行
 *  2. ↑のメールアドレスを ミモが議事録を入れる Drive フォルダに「閲覧者」として共有
 *  3. JSON の client_email を GOOGLE_SA_EMAIL に、private_key を GOOGLE_SA_PRIVATE_KEY に
 *  4. Drive API を GCP コンソールで有効化
 */
import { createSign } from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = "https://www.googleapis.com/auth/drive.readonly";

let cachedToken: { token: string; expiresAt: number } | null = null;

/** SA から OAuth Access Token を取得 (1 時間キャッシュ)。 */
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const email = process.env.GOOGLE_SA_EMAIL;
  const privateKey = (process.env.GOOGLE_SA_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  if (!email || !privateKey) {
    throw new Error("GOOGLE_SA_EMAIL / GOOGLE_SA_PRIVATE_KEY not set");
  }

  // JWT を組み立てて RS256 で署名
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: email,
    scope: SCOPES,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const b64 = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned = `${b64(header)}.${b64(claims)}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer.sign(privateKey).toString("base64url");
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  createdTime: string;
  webViewLink?: string;
  /** 再帰探索時に親フォルダ名を埋める (CA 判定用)。直下なら null。 */
  parentFolderName?: string | null;
};

/** フォルダ MIME。Drive ではフォルダもファイルとして扱われる。 */
const FOLDER_MIME = "application/vnd.google-apps.folder";

/**
 * 指定フォルダ内のファイル一覧を取得 (pagination 対応で全件)。
 * @param folderId - フォルダ ID
 * @param sinceIso - これ以降に modified されたファイルのみ (null = 全件)
 */
export async function listFolderFiles(folderId: string, sinceIso: string | null = null): Promise<DriveFile[]> {
  const token = await getAccessToken();
  // 入力値の前後空白を除去 (Vercel ENV コピペで紛れがちなタブ・改行への対策)。
  folderId = folderId.trim();
  // folderId はクエリ文字列に直接埋まるので '" を含むものは弾く (injection 防御)。
  if (!/^[A-Za-z0-9_-]+$/.test(folderId)) {
    throw new Error(`invalid folder id: ${JSON.stringify(folderId.slice(0, 20))}`);
  }
  const queryParts = [`'${folderId}' in parents`, "trashed = false"];
  if (sinceIso) {
    // ISO 8601 形式 (RFC3339) のみ許可。それ以外は弾く。
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(sinceIso)) {
      throw new Error(`invalid sinceIso: ${sinceIso.slice(0, 40)}`);
    }
    queryParts.push(`modifiedTime > '${sinceIso}'`);
  }
  const q = queryParts.join(" and ");

  const all: DriveFile[] = [];
  let pageToken: string | null = null;
  // 1000 件まで安全に取りに行く (それ以上はフォルダ設計を見直す前提)
  for (let page = 0; page < 10; page++) {
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", q);
    url.searchParams.set("fields", "nextPageToken, files(id,name,mimeType,modifiedTime,createdTime,webViewLink)");
    url.searchParams.set("orderBy", "modifiedTime desc");
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Drive list failed: ${res.status} ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
    all.push(...(data.files ?? []));
    pageToken = data.nextPageToken ?? null;
    if (!pageToken) break;
  }
  return all;
}

/**
 * Drive ファイルをテキストとしてダウンロード。MIME タイプに応じて形式を切替:
 *   - application/vnd.google-apps.document → text/plain に export
 *   - text/plain, text/* → そのまま get
 *   - application/vnd.openxmlformats-officedocument.wordprocessingml.document (.docx)
 *     → 簡易テキスト抽出 (タグ除去)。完全 docx parser は外部依存なしでは厳しいので best-effort
 *   - その他 → 拒否
 */
export async function downloadFileText(file: DriveFile): Promise<string> {
  const token = await getAccessToken();
  const auth = { Authorization: `Bearer ${token}` };

  if (file.mimeType === "application/vnd.google-apps.document") {
    // Google Docs: export to plain text
    const url = `https://www.googleapis.com/drive/v3/files/${file.id}/export?mimeType=text/plain`;
    const res = await fetch(url, { headers: auth });
    if (!res.ok) throw new Error(`Drive export failed: ${res.status}`);
    return await res.text();
  }

  if (file.mimeType.startsWith("text/")) {
    const url = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
    const res = await fetch(url, { headers: auth });
    if (!res.ok) throw new Error(`Drive get failed: ${res.status}`);
    return await res.text();
  }

  if (file.mimeType === "application/json") {
    const url = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
    const res = await fetch(url, { headers: auth });
    if (!res.ok) throw new Error(`Drive get failed: ${res.status}`);
    const json = await res.text();
    // Mimo が JSON で出すケース想定。よくある shape: {transcript: "...", segments: [{speaker, text}, ...]}
    try {
      const obj = JSON.parse(json) as { transcript?: string; text?: string; segments?: Array<{ speaker?: string; text?: string }> };
      if (typeof obj.transcript === "string") return obj.transcript;
      if (typeof obj.text === "string") return obj.text;
      if (Array.isArray(obj.segments)) {
        return obj.segments
          .map((s) => (s.speaker ? `${s.speaker}: ${s.text ?? ""}` : (s.text ?? "")))
          .filter(Boolean).join("\n");
      }
    } catch { /* fall through */ }
    return json; // パースできなければ raw を返す
  }

  // VTT / SRT 字幕
  if (file.name.match(/\.(vtt|srt)$/i)) {
    const url = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
    const res = await fetch(url, { headers: auth });
    if (!res.ok) throw new Error(`Drive get failed: ${res.status}`);
    const raw = await res.text();
    // タイムコード / シーケンス番号を除去し、本文だけ残す
    return raw
      .split(/\r?\n/)
      .filter((l) => !/^\d+$/.test(l.trim())
                  && !/^\d{2}:\d{2}/.test(l.trim())
                  && l.trim() !== "WEBVTT"
                  && !l.startsWith("NOTE "))
      .join("\n").trim();
  }

  // .docx の本格パースは外部ライブラリ依存になるため、明示的に "skip" を伝える特別エラー。
  // 呼び出し側 (driveImport) でキャッチして skip 集計に回す。
  if (file.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      || file.name.match(/\.docx$/i)) {
    throw new DocxNotSupportedError(`.docx は未対応です: ${file.name}. ミモの出力を Google Docs (.gdoc) か .txt に変更してください`);
  }

  throw new Error(`unsupported mimeType: ${file.mimeType}`);
}

/** .docx 未対応エラー。呼び出し側で「skip」扱いにする用。 */
export class DocxNotSupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocxNotSupportedError";
  }
}

/**
 * フォルダを再帰的に探索してファイル一覧を取得する。
 * サブフォルダの中身もすべて返し、各ファイルに parentFolderName をセットする。
 * @param folderId  起点フォルダ
 * @param sinceIso  これ以降の modifiedTime のみ (null=全件)
 * @param maxDepth  再帰の最大深さ。1=直下のみ、2=サブフォルダ 1 段、3=サブフォルダ 2 段 (default 3)
 */
export async function listFolderFilesRecursive(
  folderId: string,
  sinceIso: string | null = null,
  maxDepth = 3,
): Promise<DriveFile[]> {
  const visited = new Set<string>();
  const out: DriveFile[] = [];

  async function walk(curId: string, parentName: string | null, depth: number) {
    if (visited.has(curId)) return;
    visited.add(curId);
    if (depth > maxDepth) return;
    const items = await listFolderFiles(curId, sinceIso);
    for (const it of items) {
      if (it.mimeType === FOLDER_MIME) {
        // サブフォルダは再帰
        if (depth < maxDepth) await walk(it.id, it.name, depth + 1);
      } else {
        out.push({ ...it, parentFolderName: parentName });
      }
    }
  }

  await walk(folderId.trim(), null, 1);
  return out;
}

/** フォルダ ID と件数だけ確認したい時の軽量チェック (権限テスト用)。 */
export async function probeFolder(folderId: string): Promise<{
  ok: true; file_count: number; subfolder_count: number; recursive_file_count: number;
} | { ok: false; error: string }> {
  try {
    const id = folderId.trim();
    const direct = await listFolderFiles(id);
    const subfolders = direct.filter((f) => f.mimeType === FOLDER_MIME);
    const recursive = await listFolderFilesRecursive(id);
    return {
      ok: true,
      file_count: direct.filter((f) => f.mimeType !== FOLDER_MIME).length,
      subfolder_count: subfolders.length,
      recursive_file_count: recursive.length,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
