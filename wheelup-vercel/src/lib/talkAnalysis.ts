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

  // 発話速度（時刻が取れた場合）
  const timed = turns.filter((t) => t.seconds != null).map((t) => t.seconds as number);
  let speechPerMin: number | null = null;
  let durationMin: number | null = null;
  if (timed.length >= 2) {
    const dur = (Math.max(...timed) - Math.min(...timed)) / 60;
    if (dur > 0.5) { durationMin = Math.round(dur); speechPerMin = Math.round(selfChars / dur); }
  }

  return {
    selfName,
    totalTurns: turns.length,
    selfTurns: selfTurns.length,
    otherTurns: otherTurns.length,
    selfChars, otherChars,
    talkRatioSelf: Math.round((selfChars / total) * 100),
    questionCount: qCount,
    questionRate: selfTurns.length ? Math.round((qTurns / selfTurns.length) * 100) : 0,
    avgSelfTurnChars: selfTurns.length ? Math.round(selfChars / selfTurns.length) : 0,
    longestMonologue: longest,
    fillers,
    topWords,
    speechPerMin,
    durationMin,
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
