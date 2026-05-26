/**
 * Lark / Slack への通知ヘルパー。
 *
 * LARK_WEBHOOK_URL (または SLACK_WEBHOOK_URL) が設定されていれば送信、
 * 未設定なら何もしない (no-op) ので、環境変数の有無で自動的に有効/無効が切り替わる。
 *
 * 面談採点完了通知に使う。辻内氏の「反強制的に結果を目に入れる」要件への対応:
 * 採点が走るたびに本人 + チームの Lark に push する。
 */

const WEBHOOK = process.env.LARK_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL || "";

function isLark(url: string): boolean {
  return url.includes("larksuite") || url.includes("feishu");
}

/**
 * CA 名 → Lark ユーザー ID (open_id) のマッピング。
 * 環境変数 LARK_USER_IDS に JSON で設定する:
 *   LARK_USER_IDS={"小林":"ou_xxx","西村":"ou_yyy","辻内":"ou_zzz","安藤":"ou_aaa","村上":"ou_bbb"}
 *
 * 設定されていれば該当メンバーを個別メンション、無ければ名前テキストのみ。
 */
const LARK_USER_IDS: Record<string, string> = (() => {
  try {
    const raw = (process.env.LARK_USER_IDS ?? "").trim();
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
})();

// LARK_MENTION_ALL=1 なら、個別 ID が無くても全員メンション (@all) する
const MENTION_ALL = (process.env.LARK_MENTION_ALL ?? "").trim() === "1";

/** Lark メンションのプレフィックスを組み立てる。個別 ID 優先、無ければ @all、それも無ければ空。 */
function larkMentionPrefix(name: string | null): string {
  if (!isLark(WEBHOOK)) return "";
  if (name && LARK_USER_IDS[name]) return `<at user_id="${LARK_USER_IDS[name]}"></at> `;
  if (MENTION_ALL) return `<at user_id="all"></at> `;
  return "";
}

/** プレーンテキストを Lark / Slack に送る。失敗しても例外を投げない (採点処理を止めない)。 */
export async function sendChatNotification(text: string): Promise<void> {
  if (!WEBHOOK) return;
  const body = isLark(WEBHOOK) ? { msg_type: "text", content: { text } } : { text };
  try {
    await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // 通知失敗は本処理に影響させない
  }
}

type ScoreSummary = {
  consultantName: string | null;
  meetingTitle: string;
  scores: Record<string, number> | null;
  improvements?: Record<string, string[]> | null;
  appBaseUrl?: string;
};

const AXIS_LABELS: Record<string, string> = {
  needs: "ニーズ深掘り",
  proposal: "提案力",
  trust: "信頼構築",
  closing: "前進",
  intel: "情報収集",
};

/**
 * 面談採点完了の通知メッセージを組み立てて送信する。
 * 5 軸スコア + 合計 + 一番の改善ポイントを 1 通にまとめる。
 */
export async function notifyMeetingScored(s: ScoreSummary): Promise<void> {
  if (!WEBHOOK) return;

  const who = s.consultantName ? `${s.consultantName}さん` : "メンバー";
  let scoreLine = "(スコア取得失敗)";
  let total = 0;
  if (s.scores) {
    const parts: string[] = [];
    for (const key of ["needs", "proposal", "trust", "closing", "intel"]) {
      const v = Number(s.scores[key] ?? 0);
      total += v;
      parts.push(`${AXIS_LABELS[key]} ${v}`);
    }
    scoreLine = parts.join(" / ");
  }

  // 一番低い軸の改善コメントを 1 つだけピックして「次の一手」を提示
  let nextTip = "";
  if (s.scores && s.improvements) {
    let lowestKey = "needs";
    let lowestVal = 999;
    for (const key of ["needs", "proposal", "trust", "closing", "intel"]) {
      const v = Number(s.scores[key] ?? 0);
      if (v < lowestVal) { lowestVal = v; lowestKey = key; }
    }
    const tips = s.improvements[lowestKey];
    if (Array.isArray(tips) && tips.length > 0) {
      nextTip = `\n💡 伸びしろ (${AXIS_LABELS[lowestKey]}): ${tips[0]}`;
    }
  }

  const link = s.appBaseUrl ? `\n\n${s.appBaseUrl}` : "";
  // 担当 CA を個別メンション (LARK_USER_IDS 設定時)。本人に確実に気づかせる。
  const mention = larkMentionPrefix(s.consultantName);
  const text = `${mention}📊 ${who}の面談が採点されました\n「${s.meetingTitle}」\n\n合計 ${total}/50\n${scoreLine}${nextTip}${link}`;

  await sendChatNotification(text);
}
