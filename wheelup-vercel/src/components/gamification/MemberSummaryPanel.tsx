import { useMemo } from "react";
import { summarizeMember } from "../../lib/talkAnalysis";
import type { MeetingTranscript } from "../../api/client";

/**
 * メンバータブ切替時に出すサマリーダッシュボード。
 * その人の全面談のトーク傾向を平均・合算して1枚で見せる（機械計算・AI不要）。
 */
export default function MemberSummaryPanel({
  meetings, memberName, color,
}: {
  meetings: MeetingTranscript[];
  memberName: string;
  color: string;
}) {
  const s = useMemo(() => summarizeMember(meetings, memberName), [meetings, memberName]);

  if (!s) {
    return (
      <div className="rounded-2xl bg-[#fafbfc] border border-[#e5e8ec] p-4 mb-4">
        <p className="text-[11px] font-bold text-[#999]">
          分析できる議事録がまだありません（話者ラベル付きの議事録が必要です）
        </p>
      </div>
    );
  }

  const maxTrend = Math.max(100, ...s.ratioTrend);

  return (
    <div className="rounded-2xl bg-white border-2 border-[#e5e8ec] p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-black text-[#4b4b4b]">
          {memberName}さんのトーク傾向サマリー
        </h3>
        <span className="text-[10px] font-bold text-[#afafaf]">
          {s.analyzed} 件の面談から集計
        </span>
      </div>

      {/* 主なスタイル */}
      {s.topStyle && (
        <div className="rounded-xl px-3 py-2.5 mb-3" style={{ backgroundColor: color + "12", border: `1px solid ${color}33` }}>
          <div className="text-[9px] font-bold" style={{ color }}>もっとも多い会話スタイル</div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[16px] font-black" style={{ color }}>{s.topStyle.label}</span>
            <span className="text-[10px] font-bold text-[#888]">
              {s.analyzed} 件中 {s.topStyle.count} 件
            </span>
          </div>
          {s.styleCounts.length > 1 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {s.styleCounts.slice(1).map((st) => (
                <span key={st.label} className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-white border border-[#e5e8ec] text-[#777]">
                  {st.label} {st.count}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 主要指標 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <Metric label="平均発話比率" value={s.avgTalkRatio} unit="%" hint={`相手 ${100 - s.avgTalkRatio}%`} color={color} />
        <Metric label="平均質問数" value={s.avgQuestions} unit="回" hint={`オープン率 ${s.openRate}%`} color={color} />
        <Metric label="発話速度" value={s.avgSpeechPerMin ?? "—"} unit={s.avgSpeechPerMin ? "字/分" : ""} hint="平均" color={color} />
        <Metric label="キャッチボール度" value={s.avgTurnTaking} unit="%" hint={`相槌 ${s.avgBackchannel}%`} color={color} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {/* 発話比率の推移 */}
        {s.ratioTrend.length >= 2 && (
          <div className="rounded-xl bg-[#fafbfc] border border-[#eef1f4] p-2.5">
            <div className="text-[9px] font-extrabold text-[#777] mb-1.5">発話比率の推移（古い→新しい）</div>
            <div className="flex items-end gap-1 h-14">
              {s.ratioTrend.map((v, i) => (
                <div key={i} className="flex-1 flex flex-col justify-end items-center" title={`${v}%`}>
                  <div className="w-full rounded-t" style={{ height: `${(v / maxTrend) * 100}%`, backgroundColor: color, opacity: 0.35 + 0.65 * ((i + 1) / s.ratioTrend.length) }} />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[9px] font-bold text-[#aaa] mt-0.5">
              <span>{s.ratioTrend[0]}%</span>
              <span>直近 {s.ratioTrend[s.ratioTrend.length - 1]}%</span>
            </div>
          </div>
        )}

        {/* 面談内の主導権（前半/中盤/後半の平均） */}
        <div className="rounded-xl bg-[#fafbfc] border border-[#eef1f4] p-2.5">
          <div className="text-[9px] font-extrabold text-[#777] mb-1.5">面談内の発話比率（平均）</div>
          <div className="flex items-end gap-2 h-14">
            {s.avgPhaseRatios.map((p) => (
              <div key={p.label} className="flex-1 text-center flex flex-col justify-end">
                <div className="flex items-end justify-center h-10">
                  <div className="w-full rounded-t" style={{ height: `${Math.max(6, p.selfPct)}%`, backgroundColor: color }} />
                </div>
                <div className="text-[9px] font-black tabular-nums text-[#4b4b4b]">{p.selfPct}%</div>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[9px] font-bold text-[#aaa] mt-0.5">
            {s.avgPhaseRatios.map((p) => <span key={p.label}>{p.label}</span>)}
          </div>
        </div>
      </div>

      {/* 口癖 / よく使うワード */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
        <div className="rounded-xl bg-[#fafbfc] border border-[#eef1f4] p-2.5">
          <div className="text-[9px] font-extrabold text-[#777] mb-1">口癖（全面談の合計）</div>
          {s.fillers.length === 0 ? <p className="text-[10px] text-[#bbb]">検出なし</p> : (
            <div className="flex flex-wrap gap-1">
              {s.fillers.map((f) => (
                <span key={f.word} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">
                  {f.word} <span className="tabular-nums">{f.count}</span>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="rounded-xl bg-[#fafbfc] border border-[#eef1f4] p-2.5">
          <div className="text-[9px] font-extrabold text-[#777] mb-1">よく使うワード</div>
          {s.topWords.length === 0 ? <p className="text-[10px] text-[#bbb]">検出なし</p> : (
            <div className="flex flex-wrap gap-1">
              {s.topWords.map((w) => (
                <span key={w.word} className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                  {w.word} <span className="tabular-nums">{w.count}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, unit, hint, color }: {
  label: string; value: string | number; unit?: string; hint?: string; color: string;
}) {
  return (
    <div className="rounded-xl bg-[#fafbfc] border border-[#eef1f4] p-2.5 text-center">
      <div className="text-[9px] font-bold text-[#999]">{label}</div>
      <div className="text-xl font-black tabular-nums leading-tight" style={{ color }}>
        {value}<span className="text-[10px] font-bold text-[#aaa] ml-0.5">{unit}</span>
      </div>
      {hint && <div className="text-[9px] font-bold text-[#bbb]">{hint}</div>}
    </div>
  );
}
