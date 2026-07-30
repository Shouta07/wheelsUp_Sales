import type { VercelRequest, VercelResponse } from "@vercel/node";

// チームメンバー定義は src/lib/team.ts のミラー。
// サーバ側で書ける TypeScript なので、フロントと同じ型・データを直接書き写している。
// 追加時はここと src/lib/team.ts の両方を更新する。
const LEADER_NAMES = new Set(["小林"]);
const VALID_USERS = new Set(["小林", "西村", "辻内", "安藤", "村上"]);

export function getRequestUser(req: VercelRequest): string | null {
  const raw = req.headers["x-user-name"];
  const encoded = Array.isArray(raw) ? raw[0] : raw;
  if (!encoded || typeof encoded !== "string") return null;
  // フロント側で encodeURIComponent しているのでデコード (日本語名のため)
  let name: string;
  try {
    name = decodeURIComponent(encoded);
  } catch {
    return null;
  }
  return VALID_USERS.has(name) ? name : null;
}

export function isLeader(name: string | null): boolean {
  return !!name && LEADER_NAMES.has(name);
}

// 操作対象の面談 (consultant_name, is_leader) に対して、現在のユーザーが書き込み可能か判定。
// - 自分の面談: 自分のみ
// - リーダー面談: リーダー自身のみ
export function canWriteMeeting(
  currentUser: string | null,
  target: { consultant_name?: string | null; is_leader?: boolean | null },
): boolean {
  if (!currentUser) return false;
  if (target.is_leader) {
    // リーダー面談は、その面談の consultant_name に一致するリーダー本人のみ。
    return isLeader(currentUser) && currentUser === target.consultant_name;
  }
  // メンバー面談は本人のみ書き込み可。
  return currentUser === target.consultant_name;
}

// 読み込み権限。西村 FB 2026-07-18「階級性ではなく、誰の面談でも閲覧・フィードバック入力
// ができるページ設計にする」を反映し、ログイン済みなら全員の面談を閲覧可能にした。
// (書き込み=議事録の編集/削除 は引き続き canWriteMeeting で本人のみに制限)
export function canReadMeeting(
  currentUser: string | null,
  _target: { consultant_name?: string | null; is_leader?: boolean | null },
): boolean {
  return !!currentUser;
}

// フィードバック(注釈)の入力権限。西村 FB「自分や小林が手動で注釈を入れられる仕組み」
// → リーダーに限定せず、チームの誰でも他メンバーの面談にコメントできる。
export function canAnnotateMeeting(currentUser: string | null): boolean {
  return !!currentUser;
}

export function send403(res: VercelResponse, message: string) {
  return res.status(403).json({ error: message });
}
