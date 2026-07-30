// トーク傾向分析（機械計算・AI不要）。
// 西村FB 2026-07-18 ピボット: 採点でなく「話し方の癖・傾向」を可視化する。
// 議事録テキストから、発話比率・質問数・口癖・発話速度等を純粋に計算で出す。
// 過度な文脈理解を求めず、営業担当者が何をどう話しているかの傾向を知る。

export interface TalkTurn {
  speaker: string;   // 正規化した話者名（"self" or 相手名）
  raw: string;       // 生の話者ラベル
  text: string;
  seconds: number | null; // 議事録の時刻(秒)。取れれば
}

export interface TalkStats {
  selfName: string;
  totalTurns: number;
  selfTurns: number;
  otherTurns: number;
  selfChars: number;
  otherChars: number;
  talkRatioSelf: number;   // 0-100 (%)
  questionCount: number;   // self の質問数
  questionRate: number;    // self ターンに占める質問の割合 %
  avgSelfTurnChars: number;
  longestMonologue: { chars: number; text: string; seconds: number | null };
  fillers: { word: string; count: number }[];
  topWords: { word: string; count: number }[];
  speechPerMin: number | null; // 字/分 (時刻が取れた時のみ)
  durationMin: number | null;

  // ── トークの傾向（振る舞いパターン）──────────────────
  /** 質問の内訳: オープン(何/なぜ/どう…) と クローズド(はい/いいえで終わる) */
  questionMix: { open: number; closed: number; openRate: number };
  /** 相槌率: 15字未満の短い相槌ターンが self ターンに占める割合 % */
  backchannelRate: number;
  /** 会話のキャッチボール度: 話者交代の回数 / 総ターン。高いほど往復が多い */
  turnTakingRate: number;
  /** self が連続で話した最大回数（相手を挟まず続けたターン数） */
  maxConsecutiveSelfTurns: number;
  /** 前半/中盤/後半の発話比率（self %）。会話の主導権の推移 */
  phaseRatios: { label: string; selfPct: number }[];
  /** 語尾の傾向: 断定 と 曖昧(かな/かもしれない/と思います) の出現数 */
  toneMix: { assertive: number; hedged: number; hedgeRate: number };
  /** 共感・受容表現の回数（なるほど/確かに/おっしゃる通り 等） */
  empathyCount: number;
  /** 説明・提案表現の回数（例えば/というのは/おすすめ 等） */
  explainCount: number;
  /** 総合的な会話スタイルの判定（ラベル + 根拠） */
  styleLabel: { label: string; reason: string; tone: "listen" | "balance" | "talk" };
}

const SELF_ALIASES = ["あなた", "you"];

// 話者ラベル + 時刻を行から取り出す（サーバの extractSpeakerUtterances と同方針）
function parseTimeToSeconds(label: string): number | null {
  // 午前/午後 HH:MM(:SS) or HH:MM(:SS)
  const m = label.match(/(午前|午後)?\s*(\d{1,2})[:：](\d{2})(?:[:：](\d{2}))?/);
  if (!m) return null;
  let h = parseInt(m[2], 10);
  const min = parseInt(m[3], 10);
  const sec = m[4] ? parseInt(m[4], 10) : 0;
  if (m[1] === "午後" && h < 12) h += 12;
  if (m[1] === "午前" && h === 12) h = 0;
  return h * 3600 + min * 60 + sec;
}

const LABEL_PATTERNS: RegExp[] = [
  // "あなた （2026/06/10 午後03:47）" / "T SD （...）" / "あなた (17:55:10)"
  /^\s*([^\(（\d][^\(（]{0,30}?)\s*[\(（]([^\)）]*\d{1,2}[:：]\d{2}[^\)）]*)[\)）]\s*$/,
  // "山本: ..." / "[山本] ..."
  /^\s*[\[【（]?\s*([^\]】）:：]{1,20})\s*[\]】）]?\s*[:：]\s*(.*)$/,
];

export function parseTranscript(text: string, selfName: string): TalkTurn[] {
  const normSelf = selfName.trim().replace(/\s/g, "");
  const isSelf = (raw: string) => {
    const n = raw.trim().replace(/\s/g, "").toLowerCase();
    return SELF_ALIASES.includes(n) || n === normSelf.toLowerCase() || n.startsWith(normSelf.toLowerCase());
  };
  const lines = text.split(/\r?\n/);
  const turns: TalkTurn[] = [];
  let cur: TalkTurn | null = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    let label: string | null = null;
    let inline = "";
    let seconds: number | null = null;
    // pattern 1: label + time on its own line (body next lines)
    const m1 = line.match(LABEL_PATTERNS[0]);
    if (m1) {
      label = m1[1].trim();
      seconds = parseTimeToSeconds(m1[2]);
    } else {
      const m2 = line.match(LABEL_PATTERNS[1]);
      if (m2 && m2[1].length <= 20 && !/^\d+$/.test(m2[1])) {
        label = m2[1].trim();
        inline = m2[2] || "";
      }
    }
    if (label && !/https?|url|招待|リンク|line/i.test(label)) {
      if (cur) turns.push(cur);
      cur = { speaker: isSelf(label) ? "self" : label, raw: label, text: inline, seconds };
    } else if (cur) {
      cur.text += (cur.text ? " " : "") + line;
    }
  }
  if (cur) turns.push(cur);
  return turns.filter((t) => t.text.trim().length > 0);
}

const FILLER_WORDS = ["なんか", "まあ", "えっと", "えーと", "あの", "その", "やっぱり", "やっぱ",
  "一応", "逆に", "ちょっと", "そうですね", "はい", "うん", "ま、", "こう"];

const STOP_WORDS = new Set(["そう", "こと", "もの", "ため", "とき", "よう", "ところ", "感じ",
  "自分", "本当", "部分", "場合", "みたい", "ちょっと", "はい", "そうですね", "あなた"]);

function countQuestions(text: string): number {
  // 「？」or 疑問形の語尾
  let n = (text.match(/[？?]/g) || []).length;
  n += (text.match(/(ですか|ますか|でしょうか|かな。|かなと|どう(です|でしょう)|いかが)/g) || []).length;
  return n;
}

// オープンクエスチョン（5W1H系＝相手に自由に語らせる問い）の目印
const OPEN_Q = /(なぜ|どうして|どんな|どのよう|どういう|何が|何を|何か|いかが|どこが|どちら|どの(辺|くらい|ように)|具体的に|理由|背景|きっかけ|どう(思|考|感じ))/;
// 共感・受容の表現
const EMPATHY = ["なるほど", "確かに", "おっしゃる通り", "わかります", "そうですよね", "いいですね",
  "素晴らし", "ありがとうござ", "大変でした", "気持ちわか"];
// 説明・提案の表現
const EXPLAIN = ["例えば", "というのは", "具体的には", "おすすめ", "ご提案", "だと思います",
  "ポイントは", "理由は", "つまり", "逆に言うと", "一般的には"];
// 曖昧・ヘッジ表現（断定を避ける言い方）
const HEDGED = /(かもしれ|かなと|と思います|気がし|ような感じ|多分|たぶん|恐らく|おそらく|かな。|でしょうかね)/g;
// 断定表現
const ASSERTIVE = /(です。|ます。|です！|ます！|できます|あります|になります|しましょう|ください)/g;

function countAny(text: string, words: string[]): number {
  let n = 0;
  for (const w of words) {
    n += (text.match(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length;
  }
  return n;
}

export function analyzeTalk(text: string, selfName: string): TalkStats | null {
  const turns = parseTranscript(text, selfName);
  if (turns.length < 3) return null;
  const selfTurns = turns.filter((t) => t.speaker === "self");
  const otherTurns = turns.filter((t) => t.speaker !== "self");
  const selfChars = selfTurns.reduce((a, t) => a + t.text.length, 0);
  const otherChars = otherTurns.reduce((a, t) => a + t.text.length, 0);
  const total = selfChars + otherChars || 1;

  // 質問
  const qCount = selfTurns.reduce((a, t) => a + countQuestions(t.text), 0);
  const qTurns = selfTurns.filter((t) => countQuestions(t.text) > 0).length;

  // 最長独話
  let longest = { chars: 0, text: "", seconds: null as number | null };
  for (const t of selfTurns) {
    if (t.text.length > longest.chars) longest = { chars: t.text.length, text: t.text.slice(0, 140), seconds: t.seconds };
  }

  // 口癖
  const selfAll = selfTurns.map((t) => t.text).join(" ");
  const fillers = FILLER_WORDS.map((w) => ({ word: w, count: (selfAll.match(new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length }))
    .filter((f) => f.count > 0).sort((a, b) => b.count - a.count).slice(0, 8);

  // 頻出ワード（2文字以上の漢字/カタカナ連続を簡易抽出）
  const wordMap = new Map<string, number>();
  const tokens = selfAll.match(/[一-龠々]{2,}|[ァ-ヴー]{2,}/g) || [];
  for (const tk of tokens) {
    if (STOP_WORDS.has(tk) || tk.length > 8) continue;
    wordMap.set(tk, (wordMap.get(tk) || 0) + 1);
  }
  const topWords = [...wordMap.entries()].map(([word, count]) => ({ word, count }))
    .filter((w) => w.count >= 2).sort((a, b) => b.count - a.count).slice(0, 12);

  // 面談の長さ（最初と最後の時刻差）
  const timed = turns.filter((t) => t.seconds != null).map((t) => t.seconds as number);
  let durationMin: number | null = null;
  if (timed.length >= 2) {
    const dur = (Math.max(...timed) - Math.min(...timed)) / 60;
    if (dur > 0.5) durationMin = Math.round(dur);
  }

  // 発話速度（字/分）: 面談全体で割ると相手の発話時間も含まれてしまうため、
  // self の各ターンについて「次のターン開始までの時間」を発話時間とみなして合計する。
  // 5分以上空いた区間は中断・記録の飛びとみなして除外。
  let speechPerMin: number | null = null;
  {
    let selfSpeakSec = 0, selfSpeakChars = 0;
    for (let i = 0; i < turns.length; i++) {
      const t = turns[i];
      if (t.speaker !== "self" || t.seconds == null) continue;
      const next = turns.slice(i + 1).find((n) => n.seconds != null);
      if (!next || next.seconds == null) continue;
      const gap = next.seconds - t.seconds;
      if (gap <= 0 || gap > 300) continue;
      selfSpeakSec += gap;
      selfSpeakChars += t.text.length;
    }
    if (selfSpeakSec > 30) speechPerMin = Math.round(selfSpeakChars / (selfSpeakSec / 60));
  }

  // ── トークの傾向（振る舞いパターン）──────────────────
  // 質問の内訳: オープン(自由に語らせる) / クローズド(はい・いいえ)
  let openQ = 0, closedQ = 0;
  for (const t of selfTurns) {
    const q = countQuestions(t.text);
    if (q === 0) continue;
    if (OPEN_Q.test(t.text)) openQ += q; else closedQ += q;
  }
  const questionMix = {
    open: openQ, closed: closedQ,
    openRate: (openQ + closedQ) ? Math.round((openQ / (openQ + closedQ)) * 100) : 0,
  };

  // 相槌率: 15字未満の短い返しが self ターンに占める割合
  const backchannels = selfTurns.filter((t) => t.text.trim().length < 15).length;
  const backchannelRate = selfTurns.length ? Math.round((backchannels / selfTurns.length) * 100) : 0;

  // キャッチボール度 + self の連続発話最大回数
  let switches = 0, maxRun = 0, run = 0;
  for (let i = 0; i < turns.length; i++) {
    if (i > 0 && turns[i].speaker !== turns[i - 1].speaker) switches++;
    if (turns[i].speaker === "self") { run++; maxRun = Math.max(maxRun, run); } else run = 0;
  }
  const turnTakingRate = turns.length > 1 ? Math.round((switches / (turns.length - 1)) * 100) : 0;

  // 前半/中盤/後半の発話比率（会話の主導権の推移）
  const third = Math.max(1, Math.ceil(turns.length / 3));
  const phaseRatios = ["前半", "中盤", "後半"].map((label, i) => {
    const seg = turns.slice(i * third, (i + 1) * third);
    const sc = seg.filter((t) => t.speaker === "self").reduce((a, t) => a + t.text.length, 0);
    const oc = seg.filter((t) => t.speaker !== "self").reduce((a, t) => a + t.text.length, 0);
    return { label, selfPct: (sc + oc) ? Math.round((sc / (sc + oc)) * 100) : 0 };
  });

  // 語尾の傾向（断定 vs 曖昧）
  const assertive = (selfAll.match(ASSERTIVE) || []).length;
  const hedged = (selfAll.match(HEDGED) || []).length;
  const toneMix = {
    assertive, hedged,
    hedgeRate: (assertive + hedged) ? Math.round((hedged / (assertive + hedged)) * 100) : 0,
  };

  // 共感・説明表現
  const empathyCount = countAny(selfAll, EMPATHY);
  const explainCount = countAny(selfAll, EXPLAIN);

  // 会話スタイルの総合判定（発話比率 × 質問量で分類）
  const ratio = Math.round((selfChars / total) * 100);
  const qPerTurn = selfTurns.length ? qCount / selfTurns.length : 0;
  let styleLabel: TalkStats["styleLabel"];
  if (ratio >= 65) {
    styleLabel = { label: "説明・提案リード型", tone: "talk",
      reason: `担当者の発話が${ratio}%。伝える量が多く、相手の発話は${100 - ratio}%。` };
  } else if (ratio <= 40 && qPerTurn >= 0.3) {
    styleLabel = { label: "傾聴・ヒアリング型", tone: "listen",
      reason: `発話${ratio}%に抑えつつ質問${qCount}回。相手に語らせる進め方。` };
  } else if (ratio <= 45) {
    styleLabel = { label: "聞き役中心型", tone: "listen",
      reason: `発話${ratio}%。相手の話す時間が長く、質問は${qCount}回。` };
  } else if (qPerTurn >= 0.35) {
    styleLabel = { label: "対話・深掘り型", tone: "balance",
      reason: `発話${ratio}%でバランスを取りつつ質問${qCount}回で掘り下げ。` };
  } else {
    styleLabel = { label: "バランス型", tone: "balance",
      reason: `発話${ratio}%・質問${qCount}回。話す/聞くが中間的。` };
  }

  return {
    selfName,
    totalTurns: turns.length,
    selfTurns: selfTurns.length,
    otherTurns: otherTurns.length,
    selfChars, otherChars,
    talkRatioSelf: ratio,
    questionCount: qCount,
    questionRate: selfTurns.length ? Math.round((qTurns / selfTurns.length) * 100) : 0,
    avgSelfTurnChars: selfTurns.length ? Math.round(selfChars / selfTurns.length) : 0,
    longestMonologue: longest,
    fillers,
    topWords,
    speechPerMin,
    durationMin,
    questionMix,
    backchannelRate,
    turnTakingRate,
    maxConsecutiveSelfTurns: maxRun,
    phaseRatios,
    toneMix,
    empathyCount,
    explainCount,
    styleLabel,
  };
}

// CSV 1 行分（面談単位）に変換
export function talkStatsToCsvRow(meta: { date: string; title: string; consultant: string }, s: TalkStats): Record<string, string | number> {
  return {
    日付: meta.date,
    担当者: meta.consultant,
    面談: meta.title.replace(/,/g, " ").replace(/\s*\[mimo:[^\]]+\]/, ""),
    発話比率_担当: s.talkRatioSelf,
    発話比率_相手: 100 - s.talkRatioSelf,
    総ターン数: s.totalTurns,
    担当ターン数: s.selfTurns,
    質問数: s.questionCount,
    質問率: s.questionRate,
    平均発話文字数: s.avgSelfTurnChars,
    最長独話文字数: s.longestMonologue.chars,
    発話速度_字每分: s.speechPerMin ?? "",
    面談時間_分: s.durationMin ?? "",
    会話スタイル: s.styleLabel.label,
    オープン質問数: s.questionMix.open,
    クローズド質問数: s.questionMix.closed,
    オープン質問率: s.questionMix.openRate,
    相槌率: s.backchannelRate,
    キャッチボール度: s.turnTakingRate,
    最大連続発話回数: s.maxConsecutiveSelfTurns,
    発話比率_前半: s.phaseRatios[0]?.selfPct ?? "",
    発話比率_中盤: s.phaseRatios[1]?.selfPct ?? "",
    発話比率_後半: s.phaseRatios[2]?.selfPct ?? "",
    曖昧表現率: s.toneMix.hedgeRate,
    共感表現数: s.empathyCount,
    説明提案表現数: s.explainCount,
    口癖トップ3: s.fillers.slice(0, 3).map((f) => `${f.word}:${f.count}`).join(" "),
    頻出ワードトップ3: s.topWords.slice(0, 3).map((w) => `${w.word}:${w.count}`).join(" "),
  };
}

export function rowsToCsv(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h] ?? "")).join(","));
  return "﻿" + lines.join("\n"); // BOM付きでExcel文字化け防止
}

// ── メンバー単位のサマリー集計 ──────────────────────────
// 各面談の TalkStats を平均・合計して「この人の傾向」を1枚にまとめる。

export interface MemberSummary {
  analyzed: number;              // 分析できた面談数
  avgTalkRatio: number;          // 平均発話比率 %
  avgQuestions: number;          // 1面談あたりの平均質問数
  openRate: number;              // オープン質問率 %
  avgSpeechPerMin: number | null;// 平均発話速度 字/分
  avgBackchannel: number;        // 平均相槌率 %
  avgTurnTaking: number;         // 平均キャッチボール度 %
  hedgeRate: number;             // 曖昧表現率 %
  topStyle: { label: string; count: number } | null;
  styleCounts: { label: string; count: number }[];
  fillers: { word: string; count: number }[];
  topWords: { word: string; count: number }[];
  /** 直近の面談から古い順に並べた発話比率（推移スパークライン用・最大10件） */
  ratioTrend: number[];
  avgPhaseRatios: { label: string; selfPct: number }[];
}

export function summarizeMember(
  meetings: { transcript_text?: string | null; recorded_at?: string; consultant_name?: string | null }[],
  memberName: string,
): MemberSummary | null {
  const withStats = meetings
    .map((m) => ({
      at: m.recorded_at || "",
      stats: m.transcript_text ? analyzeTalk(m.transcript_text, m.consultant_name || memberName) : null,
    }))
    .filter((x): x is { at: string; stats: TalkStats } => !!x.stats);

  if (withStats.length === 0) return null;
  const n = withStats.length;
  const sum = (f: (s: TalkStats) => number) => withStats.reduce((a, x) => a + f(x.stats), 0);
  const avg = (f: (s: TalkStats) => number) => Math.round(sum(f) / n);

  // 会話スタイルの分布
  const styleMap = new Map<string, number>();
  for (const { stats } of withStats) {
    styleMap.set(stats.styleLabel.label, (styleMap.get(stats.styleLabel.label) || 0) + 1);
  }
  const styleCounts = [...styleMap.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // 口癖・頻出ワードは全面談で合算
  const mergeCounts = (pick: (s: TalkStats) => { word: string; count: number }[]) => {
    const map = new Map<string, number>();
    for (const { stats } of withStats) {
      for (const w of pick(stats)) map.set(w.word, (map.get(w.word) || 0) + w.count);
    }
    return [...map.entries()].map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count).slice(0, 8);
  };

  // オープン質問率は合計ベース（面談ごとの率を平均すると質問0件の回に引っ張られるため）
  const openTotal = sum((s) => s.questionMix.open);
  const closedTotal = sum((s) => s.questionMix.closed);
  const assertTotal = sum((s) => s.toneMix.assertive);
  const hedgeTotal = sum((s) => s.toneMix.hedged);

  const speedVals = withStats.map((x) => x.stats.speechPerMin).filter((v): v is number => v != null);

  // 発話比率の推移（古い→新しい、最大10件）
  const ratioTrend = [...withStats]
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
    .slice(-10)
    .map((x) => x.stats.talkRatioSelf);

  const avgPhaseRatios = ["前半", "中盤", "後半"].map((label, i) => ({
    label,
    selfPct: Math.round(withStats.reduce((a, x) => a + (x.stats.phaseRatios[i]?.selfPct ?? 0), 0) / n),
  }));

  return {
    analyzed: n,
    avgTalkRatio: avg((s) => s.talkRatioSelf),
    avgQuestions: Math.round((sum((s) => s.questionCount) / n) * 10) / 10,
    openRate: (openTotal + closedTotal) ? Math.round((openTotal / (openTotal + closedTotal)) * 100) : 0,
    avgSpeechPerMin: speedVals.length ? Math.round(speedVals.reduce((a, b) => a + b, 0) / speedVals.length) : null,
    avgBackchannel: avg((s) => s.backchannelRate),
    avgTurnTaking: avg((s) => s.turnTakingRate),
    hedgeRate: (assertTotal + hedgeTotal) ? Math.round((hedgeTotal / (assertTotal + hedgeTotal)) * 100) : 0,
    topStyle: styleCounts[0] || null,
    styleCounts,
    fillers: mergeCounts((s) => s.fillers),
    topWords: mergeCounts((s) => s.topWords),
    ratioTrend,
    avgPhaseRatios,
  };
}
