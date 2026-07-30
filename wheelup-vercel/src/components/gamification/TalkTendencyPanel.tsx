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

/** 2値の傾向を1本のバーで示す（左が主指標） */
function MiniBar({ label, leftLabel, rightLabel, pct, color, hint }:
  { label: string; leftLabel: string; rightLabel: string; pct: number; color: string; hint?: string }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-extrabold text-[#4b4b4b]">{label}</span>
        <span className="text-[9px] font-bold text-[#888]">
          <span style={{ color }}>{leftLabel}</span> <span className="text-[#ccc]">|</span> {rightLabel}
        </span>
      </div>
      <div className="h-2 rounded-full bg-[#eee] overflow-hidden mt-0.5">
        <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: color, height: "100%" }} />
      </div>
      {hint && <div className="text-[8.5px] text-[#aaa] mt-0.5">{hint}</div>}
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

      {/* 会話スタイル判定 */}
      {(() => {
        const tone = stats.styleLabel.tone;
        const c = tone === "listen" ? { bg: "#ECFDF5", bd: "#A7F3D0", fg: "#047857" }
          : tone === "talk" ? { bg: "#FFF7ED", bd: "#FED7AA", fg: "#C2410C" }
          : { bg: "#EFF6FF", bd: "#BFDBFE", fg: "#1D4ED8" };
        return (
          <div className="rounded-lg p-2.5" style={{ backgroundColor: c.bg, border: `1px solid ${c.bd}` }}>
            <div className="text-[9px] font-bold" style={{ color: c.fg }}>この面談の会話スタイル</div>
            <div className="text-[15px] font-black" style={{ color: c.fg }}>{stats.styleLabel.label}</div>
            <div className="text-[10px] font-bold text-[#666] leading-relaxed mt-0.5">{stats.styleLabel.reason}</div>
          </div>
        );
      })()}

      {/* 発話比率 */}
      <Bar label="発話比率" leftPct={stats.talkRatioSelf} leftName={consultant} rightName="相手" />

      {/* 発話比率の推移（前半→中盤→後半） */}
      <div className="rounded-lg bg-white border border-[#eee] p-2">
        <div className="text-[9px] font-extrabold text-[#777] mb-1.5">発話比率の推移（会話の主導権）</div>
        <div className="flex items-end gap-2">
          {stats.phaseRatios.map((p) => (
            <div key={p.label} className="flex-1 text-center">
              <div className="h-14 flex items-end justify-center">
                <div className="w-full rounded-t" style={{ height: `${Math.max(6, p.selfPct)}%`, backgroundColor: BLUE }} />
              </div>
              <div className="text-[10px] font-black tabular-nums text-[#4b4b4b] mt-0.5">{p.selfPct}%</div>
              <div className="text-[9px] font-bold text-[#999]">{p.label}</div>
            </div>
          ))}
        </div>
        <div className="text-[9px] text-[#aaa] mt-1">※ 棒は担当者が話した割合。前半で聞き後半で話す等の流れが分かります。</div>
      </div>

      {/* 会話の振る舞い */}
      <div className="rounded-lg bg-white border border-[#eee] p-2">
        <div className="text-[9px] font-extrabold text-[#777] mb-1.5">会話の振る舞い</div>
        <div className="space-y-1.5">
          <MiniBar label="質問の質" leftLabel={`オープン ${stats.questionMix.open}`} rightLabel={`クローズド ${stats.questionMix.closed}`}
            pct={stats.questionMix.openRate} color="#10B981"
            hint="オープン質問ほど相手が自由に語れます" />
          <MiniBar label="言い切り度" leftLabel={`断定 ${stats.toneMix.assertive}`} rightLabel={`曖昧 ${stats.toneMix.hedged}`}
            pct={100 - stats.toneMix.hedgeRate} color="#8B5CF6"
            hint="曖昧表現(かも/と思います)が多いと自信が薄く聞こえがち" />
          <MiniBar label="キャッチボール度" leftLabel={`交代 ${stats.turnTakingRate}%`} rightLabel={`最大連続 ${stats.maxConsecutiveSelfTurns}回`}
            pct={stats.turnTakingRate} color="#1CB0F6"
            hint="高いほど短い往復、低いほど長い一方通行" />
          <MiniBar label="相槌の多さ" leftLabel={`相槌 ${stats.backchannelRate}%`} rightLabel={`しっかり発話 ${100 - stats.backchannelRate}%`}
            pct={stats.backchannelRate} color="#F59E0B"
            hint="短い受け返しが占める割合" />
        </div>
        <div className="flex gap-2 mt-2">
          <div className="flex-1 rounded bg-emerald-50 border border-emerald-200 px-2 py-1 text-center">
            <div className="text-[9px] font-bold text-emerald-700">共感・受容表現</div>
            <div className="text-sm font-black text-emerald-800 tabular-nums">{stats.empathyCount}<span className="text-[9px] ml-0.5">回</span></div>
          </div>
          <div className="flex-1 rounded bg-blue-50 border border-blue-200 px-2 py-1 text-center">
            <div className="text-[9px] font-bold text-blue-700">説明・提案表現</div>
            <div className="text-sm font-black text-blue-800 tabular-nums">{stats.explainCount}<span className="text-[9px] ml-0.5">回</span></div>
          </div>
        </div>
      </div>

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
