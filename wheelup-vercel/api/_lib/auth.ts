import type { VercelRequest, VercelResponse } from "@vercel/node";

// チームメンバー定義は src/lib/team.ts のミラー。
// サーバ側で書ける TypeScript なので、フロントと同じ型・データを直接書き写している。
// 追加時はここと src/lib/team.ts の両方を更新する。
const LEADER_NAMES = new Set(["小林"]);
const VALID_USERS = new Set(["小林", "西村", "辻内", "安藤", "村上"]);

export function getRequestUser(req: VercelRequest): string | null {
  const raw = req.headers["x-user-name"];
  const name = Array.isArray(raw) ? raw[0] : raw;
  if (!name || typeof name !== "string") return null;
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

// 読み込み権限: リーダー面談はリーダー本人のみ、メンバー面談は本人＋リーダー (フィードバック用)。
export function canReadMeeting(
  currentUser: string | null,
  target: { consultant_name?: string | null; is_leader?: boolean | null },
): boolean {
  if (!currentUser) return false;
  if (target.is_leader) {
    return isLeader(currentUser) && currentUser === target.consultant_name;
  }
  return currentUser === target.consultant_name || isLeader(currentUser);
}

export function send403(res: VercelResponse, message: string) {
  return res.status(403).json({ error: message });
}
