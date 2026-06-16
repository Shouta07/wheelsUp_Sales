import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMeetings, type MeetingTranscript, type MeetingScore } from "../../api/client";
import { AXIS_CURRICULUM, CATEGORY_STYLE, type AxisKey } from "../../lib/axisLearning";
import LearningModal from "./LearningModal";

/**
 * スキルギャップ + 学習導線（メンバートップ）。
 * 西村 FB: 成長グラフは不要。リーダーと比べてどのスキルが足りないか一目で分かり、
 *   課題を改善するための項目別の学習（アプリ内教材）に飛べる状態にする。
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
  const [learnAxis, setLearnAxis] = useState<AxisKey | null>(null);

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

  const ranked = useMemo(() => {
    return [...DIMS]
      .map((d) => {
        const me = myAvg?.[d.key] ?? null;
        const ld = leaderAvg?.[d.key] ?? null;
        const gap = me !== null && ld !== null ? me - ld : null;
        return { ...d, me, ld, gap };
      })
      .sort((a, b) => {
        if (a.gap === null) return 1;
        if (b.gap === null) return -1;
        return a.gap - b.gap;
      });
  }, [myAvg, leaderAvg]);

  if (!myAvg) {
    return (
      <div className="rounded-2xl bg-white border-2 border-[#e5e5e5] p-4 mb-4">
        <h2 className="text-base font-black text-[#4b4b4b] mb-1">🎯 リーダーとのスキルギャップ</h2>
        <p className="text-xs font-bold text-[#aaa] mb-3">面談を採点すると、リーダー（小林）と比べてどのスキルが足りないかが表示されます。</p>
        <div className="flex flex-wrap gap-1.5">
          {DIMS.map((d) => (
            <button key={d.key} onClick={() => setLearnAxis(d.key)}
              className="text-[11px] font-extrabold px-2.5 py-1.5 rounded-xl"
              style={{ backgroundColor: d.color + "18", color: d.color }}>
              📚 {d.label}
            </button>
          ))}
        </div>
        {learnAxis && <LearningModal axis={learnAxis} onClose={() => setLearnAxis(null)} />}
      </div>
    );
  }

  const weakAxes = ranked.filter((r) => r.gap !== null && r.gap < 0);
  const focusAxes = (weakAxes.length > 0 ? weakAxes : ranked.slice(0, 2)).slice(0, 3);

  return (
    <div className="rounded-2xl bg-white border-2 border-[#e5e5e5] p-4 mb-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-base font-black text-[#4b4b4b]">🎯 リーダーとのスキルギャップ</h2>
        <span className="text-[10px] font-bold text-[#afafaf]">採点済み面談の平均で比較</span>
      </div>
      <p className="text-[11px] font-bold text-[#777] mb-3">
        リーダー（小林）の平均と比べて足りない順に並べています。下の「強化テーマ」から学習に進めます。
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

      {/* 強化テーマ = 弱い軸のカリキュラム導線 */}
      <div className="mt-4 pt-3 border-t border-[#eee]">
        <p className="text-[11px] font-extrabold text-[#4b4b4b] mb-2">📚 重点強化テーマ（弱い順）</p>
        <div className="space-y-2">
          {focusAxes.map((r) => {
            const cur = AXIS_CURRICULUM[r.key];
            return (
              <button
                key={r.key}
                onClick={() => setLearnAxis(r.key)}
                className="w-full text-left rounded-xl border border-[#eee] overflow-hidden hover:border-[#ccc] transition-colors"
              >
                <div className="flex items-center gap-2 px-3 py-1.5" style={{ backgroundColor: r.color + "12" }}>
                  <span className="text-[11px] font-extrabold px-1.5 py-0.5 rounded" style={{ backgroundColor: r.color + "25", color: r.color }}>
                    {r.label}
                  </span>
                  {r.gap !== null && r.gap < 0 && (
                    <span className="text-[10px] font-black text-duo-red">{r.gap.toFixed(1)} 点ぶん伸びしろ</span>
                  )}
                  <span className="ml-auto text-[10px] font-extrabold" style={{ color: r.color }}>学ぶ →</span>
                </div>
                <div className="px-3 py-2">
                  <p className="text-[10px] font-bold text-[#777] leading-relaxed mb-1">{cur.goal}</p>
                  <div className="flex flex-wrap gap-1">
                    {cur.sections.map((s, i) => {
                      const cs = CATEGORY_STYLE[s.category];
                      return (
                        <span key={i} className="text-[9px] font-extrabold px-1.5 py-0.5 rounded" style={{ backgroundColor: cs.bg, color: cs.fg }}>
                          {s.category}：{s.title}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-[9px] text-[#aaa] mt-2">テーマをクリックすると、面談技術・業界知識・顧客知識の教材が開きます。</p>
      </div>

      {learnAxis && <LearningModal axis={learnAxis} onClose={() => setLearnAxis(null)} />}
    </div>
  );
}
