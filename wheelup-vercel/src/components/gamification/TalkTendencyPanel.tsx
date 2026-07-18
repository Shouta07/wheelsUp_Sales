import { useMemo } from "react";
import { analyzeTalk, type TalkStats } from "../../lib/talkAnalysis";

/**
 * トーク傾向パネル（機械計算・AI不要）。西村FB 2026-07-18 ピボット。
 * 議事録テキストから話し方の傾向を可視化する。採点(良し悪し判定)はしない。
 */
const BLUE = "#1CB0F6";
const GRAY = "#94A3B8";

function Bar({ label, leftPct, leftName, rightName }: { label: string; leftPct: number; leftName: string; rightName: string }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] font-bold text-[#777]">{label}</span>
        <span className="text-[10px] font-extrabold tabular-nums text-[#4b4b4b]">
          {leftName} {leftPct}% <span className="text-[#bbb]">/</span> {rightName} {100 - leftPct}%
        </span>
      </div>
      <div className="flex h-3.5 rounded-full overflow-hidden bg-[#eee]">
        <div style={{ width: `${leftPct}%`, backgroundColor: BLUE }} />
        <div style={{ width: `${100 - leftPct}%`, backgroundColor: GRAY }} />
      </div>
    </div>
  );
}

function Stat({ label, value, unit, hint }: { label: string; value: string | number; unit?: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-white border border-[#eee] p-2 text-center">
      <div className="text-[9px] font-bold text-[#999]">{label}</div>
      <div className="text-lg font-black text-[#4b4b4b] tabular-nums leading-tight">
        {value}<span className="text-[10px] font-bold text-[#aaa] ml-0.5">{unit}</span>
      </div>
      {hint && <div className="text-[8px] text-[#bbb] leading-tight">{hint}</div>}
    </div>
  );
}

export default function TalkTendencyPanel({
  transcript, consultant, onJump,
}: {
  transcript: string;
  consultant: string;
  onJump?: (text: string) => void;
}) {
  const stats: TalkStats | null = useMemo(
    () => (transcript && consultant ? analyzeTalk(transcript, consultant) : null),
    [transcript, consultant],
  );

  if (!stats) {
    return (
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
        <div className="text-[10px] font-extrabold text-slate-600">📊 トーク傾向（自動分析）</div>
        <p className="text-[10px] font-bold text-[#aaa] mt-1">
          話者ラベル付きの議事録がないため分析できません（Google Meet 形式推奨）。
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider">📊 トーク傾向（自動分析・良し悪しは判定しません）</span>
      </div>

      {/* 発話比率 */}
      <Bar label="発話比率" leftPct={stats.talkRatioSelf} leftName={consultant} rightName="相手" />

      {/* 指標グリッド */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-1.5">
        <Stat label="質問数" value={stats.questionCount} unit="回" hint={`質問率 ${stats.questionRate}%`} />
        <Stat label="担当ターン" value={stats.selfTurns} unit="回" />
        <Stat label="平均発話" value={stats.avgSelfTurnChars} unit="字" hint="1発話あたり" />
        <Stat label="最長独話" value={stats.longestMonologue.chars} unit="字" />
        <Stat label="発話速度" value={stats.speechPerMin ?? "—"} unit={stats.speechPerMin ? "字/分" : ""} hint={stats.durationMin ? `${stats.durationMin}分` : "時刻なし"} />
        <Stat label="総ターン" value={stats.totalTurns} unit="回" />
      </div>

      {/* 口癖 & 頻出ワード */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="rounded-lg bg-white border border-[#eee] p-2">
          <div className="text-[9px] font-extrabold text-[#777] mb-1">口癖トップ</div>
          {stats.fillers.length === 0 ? (
            <p className="text-[10px] text-[#bbb]">検出なし</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {stats.fillers.map((f) => (
                <span key={f.word} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                  {f.word} <span className="tabular-nums">{f.count}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-lg bg-white border border-[#eee] p-2">
          <div className="text-[9px] font-extrabold text-[#777] mb-1">よく使うワード</div>
          {stats.topWords.length === 0 ? (
            <p className="text-[10px] text-[#bbb]">検出なし</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {stats.topWords.map((w) => (
                <span key={w.word} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                  {w.word} <span className="tabular-nums">{w.count}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 最長独話（クリックでジャンプ） */}
      {stats.longestMonologue.chars > 0 && (
        <button
          onClick={() => onJump?.(stats.longestMonologue.text)}
          className="w-full text-left rounded-lg bg-white border border-[#eee] p-2 hover:border-slate-300"
        >
          <div className="text-[9px] font-extrabold text-[#777] mb-0.5">
            一番長く話した場面（{stats.longestMonologue.chars}字{stats.longestMonologue.seconds != null ? ` / ${Math.floor(stats.longestMonologue.seconds/3600)}:${String(Math.floor((stats.longestMonologue.seconds%3600)/60)).padStart(2,"0")}頃` : ""}）
          </div>
          <p className="text-[10px] font-bold text-[#555] leading-relaxed">「{stats.longestMonologue.text}…」</p>
        </button>
      )}
    </div>
  );
}
