import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMeetings, type MeetingTranscript, type MeetingScore } from "../../api/client";
import { AXIS_LEARNING, type AxisKey } from "../../lib/axisLearning";

/**
 * スキルギャップ + 学習リンク（メンバートップ）。
 * 西村 FB: 成長グラフは意味がない。リーダーと比較してどのスキルが足りないか一目で分かり、
 *   その課題を改善するための項目別の学習リンクが並んでいる状態が望ましい。
 */
const DIMS: { key: AxisKey; label: string; color: string }[] = [
  { key: "needs", label: "ニーズ深掘り", color: "#1CB0F6" },
  { key: "proposal", label: "提案力・戦略", color: "#58CC02" },
  { key: "trust", label: "信頼構築", color: "#CE82FF" },
  { key: "closing", label: "前進・意思決定支援", color: "#FF9600" },
  { key: "intel", label: "情報網羅", color: "#FF4B4B" },
];

function avgByAxis(transcripts: MeetingTranscript[] | undefined): Record<AxisKey, number> | null {
  const scored = (transcripts || []).filter((m) => m.score_data?.scores);
  if (scored.length === 0) return null;
  const sum: Record<string, number> = { needs: 0, proposal: 0, trust: 0, closing: 0, intel: 0 };
  for (const m of scored) {
    const s = (m.score_data as MeetingScore).scores;
    for (const k of Object.keys(sum)) sum[k] += s[k as keyof typeof s] ?? 0;
  }
  const out = {} as Record<AxisKey, number>;
  for (const k of Object.keys(sum)) out[k as AxisKey] = sum[k] / scored.length;
  return out;
}

export default function SkillGapPanel({ currentUser }: { currentUser: string }) {
  const { data: mine } = useQuery({
    queryKey: ["meetings", "mine", currentUser, "gap"],
    queryFn: () => fetchMeetings(undefined, undefined, currentUser),
    enabled: !!currentUser,
  });
  const { data: leader } = useQuery({
    queryKey: ["meetings", "leader", "gap"],
    queryFn: () => fetchMeetings(undefined, undefined, undefined, true),
  });

  const myAvg = useMemo(() => avgByAxis(mine?.transcripts), [mine]);
  const leaderAvg = useMemo(() => avgByAxis(leader?.transcripts), [leader]);

  // 軸をギャップ（自分 - リーダー）の小さい順 = 弱い順に並べる
  const ranked = useMemo(() => {
    return [...DIMS]
      .map((d) => {
        const me = myAvg?.[d.key] ?? null;
        const ld = leaderAvg?.[d.key] ?? null;
        const gap = me !== null && ld !== null ? me - ld : null;
        return { ...d, me, ld, gap };
      })
      .sort((a, b) => {
        // gap が小さい(=弱い)順。data が無いものは後ろ。
        if (a.gap === null) return 1;
        if (b.gap === null) return -1;
        return a.gap - b.gap;
      });
  }, [myAvg, leaderAvg]);

  if (!myAvg) {
    return (
      <div className="rounded-2xl bg-white border-2 border-[#e5e5e5] p-4 mb-4">
        <h2 className="text-base font-black text-[#4b4b4b] mb-1">🎯 リーダーとのスキルギャップ</h2>
        <p className="text-xs font-bold text-[#aaa]">面談を採点すると、リーダー（小林）と比べてどのスキルが足りないかが表示されます。</p>
      </div>
    );
  }

  // 強化対象 = ギャップがマイナス（リーダー未満）の軸。無ければ絶対値が低い順 上位2軸。
  const weakAxes = ranked.filter((r) => r.gap !== null && r.gap < 0);
  const focusAxes = (weakAxes.length > 0 ? weakAxes : ranked.slice(0, 2)).slice(0, 3);

  return (
    <div className="rounded-2xl bg-white border-2 border-[#e5e5e5] p-4 mb-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-black text-[#4b4b4b]">🎯 リーダーとのスキルギャップ</h2>
        <span className="text-[10px] font-bold text-[#afafaf]">採点済み面談の平均で比較</span>
      </div>
      <p className="text-[11px] font-bold text-[#777] mb-3">
        リーダー（小林）の平均と比べて、足りない順に並べています。下の「強化テーマ」の学習リンクで課題を埋めましょう。
      </p>

      {/* 軸別ギャップバー（弱い順） */}
      <div className="space-y-2.5">
        {ranked.map((r) => {
          const me = r.me ?? 0;
          const ld = r.ld;
          const gap = r.gap;
          return (
            <div key={r.key}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[11px] font-extrabold text-[#4b4b4b]">{r.label}</span>
                <div className="flex items-center gap-2">
                  {gap !== null && (
                    <span className={`text-[10px] font-black ${gap >= 0 ? "text-duo-green" : "text-duo-red"}`}>
                      {gap >= 0 ? `+${gap.toFixed(1)}` : gap.toFixed(1)} vs リーダー
                    </span>
                  )}
                  <span className="text-xs font-black tabular-nums w-8 text-right" style={{ color: r.color }}>{me.toFixed(1)}</span>
                </div>
              </div>
              <div className="relative h-3 bg-[#eee] rounded-full overflow-hidden">
                <div className="absolute h-full rounded-full" style={{ width: `${me * 10}%`, backgroundColor: r.color }} />
                {ld !== null && (
                  <div className="absolute top-0 h-full w-0.5 bg-[#4b4b4b] opacity-50" style={{ left: `${ld * 10}%` }} title={`リーダー平均 ${ld.toFixed(1)}`} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 強化テーマ = 弱い軸の学習リンク */}
      <div className="mt-4 pt-3 border-t border-[#eee]">
        <p className="text-[11px] font-extrabold text-[#4b4b4b] mb-2">📚 重点強化テーマ（弱い順）と学習リンク</p>
        <div className="space-y-2">
          {focusAxes.map((r) => (
            <div key={r.key} className="rounded-xl border border-[#eee] overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-1.5" style={{ backgroundColor: r.color + "12" }}>
                <span className="text-[11px] font-extrabold px-1.5 py-0.5 rounded" style={{ backgroundColor: r.color + "25", color: r.color }}>
                  {r.label}
                </span>
                {r.gap !== null && r.gap < 0 && (
                  <span className="text-[10px] font-black text-duo-red">{r.gap.toFixed(1)} 点ぶん伸びしろ</span>
                )}
              </div>
              <div className="p-2 space-y-1.5">
                {AXIS_LEARNING[r.key].map((lk, i) => (
                  <div key={i} className="rounded-lg bg-[#f7f9ff] border border-[#dde6ff] px-2 py-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[9px] font-extrabold px-1 rounded ${lk.kind === "industry" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
                        {lk.kind === "industry" ? "業界・顧客知識" : "面談技術"}
                      </span>
                      <span className="text-[11px] font-extrabold text-[#4b4b4b]">{lk.title}</span>
                      {lk.url && (
                        <a href={lk.url} target="_blank" rel="noopener noreferrer" className="text-[9px] font-extrabold text-duo-blue underline">
                          教材を見る →
                        </a>
                      )}
                    </div>
                    <p className="text-[10px] text-[#777] leading-relaxed mt-0.5">{lk.note}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
