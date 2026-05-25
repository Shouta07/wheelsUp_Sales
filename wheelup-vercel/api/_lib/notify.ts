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
  const text = `📊 ${who}の面談が採点されました\n「${s.meetingTitle}」\n\n合計 ${total}/50\n${scoreLine}${nextTip}${link}`;

  await sendChatNotification(text);
}
