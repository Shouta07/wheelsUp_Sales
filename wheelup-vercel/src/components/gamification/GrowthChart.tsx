import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMeetings, type MeetingTranscript } from "../../api/client";

/**
 * 個人成長グラフ — 自分の 5 軸スコアを時系列で表示。
 * - 採点済み面談を時系列でソート
 * - 各軸の推移を折れ線で表示
 * - リーダー平均との比較は SkillRadar (別コンポーネント) でやるので、ここは "個人の伸び" に特化
 */
const DIMS = [
  { key: "needs", label: "ニーズ", color: "#1CB0F6" },
  { key: "proposal", label: "提案", color: "#58CC02" },
  { key: "trust", label: "信頼", color: "#CE82FF" },
  { key: "closing", label: "前進", color: "#FF9600" },
  { key: "intel", label: "情報", color: "#FF4B4B" },
] as const;

export default function GrowthChart({ currentUser }: { currentUser: string }) {
  const { data } = useQuery({
    queryKey: ["meetings", "mine", currentUser, "growth"],
    queryFn: () => fetchMeetings(undefined, undefined, currentUser),
    enabled: !!currentUser,
  });

  const series = useMemo(() => {
    const scored = (data?.transcripts || [])
      .filter((m: MeetingTranscript) => m.score_data?.scores)
      .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
    return scored;
  }, [data]);

  if (series.length < 2) {
    return (
      <div className="card-duo p-4">
        <div className="text-[10px] font-extrabold text-[#777] uppercase tracking-wider mb-2">📈 成長推移</div>
        <p className="text-xs font-bold text-[#aaa]">
          {series.length === 0
            ? "面談を採点すると 5 軸スコアの推移が見えるようになります"
            : "あと 1 件採点するとグラフ表示されます"}
        </p>
      </div>
    );
  }

  // SVG 描画用の座標計算
  const W = 280;
  const H = 140;
  const padX = 30;
  const padY = 15;
  const stepX = (W - padX * 2) / (series.length - 1);
  const yScale = (v: number) => H - padY - (v / 10) * (H - padY * 2);

  return (
    <div className="card-duo p-4">
      <div className="text-[10px] font-extrabold text-[#777] uppercase tracking-wider mb-2">
        📈 あなたの成長推移 ({series.length} 件)
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {/* Y 軸グリッド */}
        {[0, 2, 5, 8, 10].map((y) => (
          <g key={y}>
            <line x1={padX} y1={yScale(y)} x2={W - padX} y2={yScale(y)} stroke="#eee" strokeWidth={0.5} />
            <text x={padX - 4} y={yScale(y) + 3} fontSize={8} fill="#aaa" textAnchor="end" fontWeight="700">{y}</text>
          </g>
        ))}

        {/* 各軸の折れ線 */}
        {DIMS.map(({ key, color }) => {
          const points = series
            .map((m, i) => {
              const scores = m.score_data?.scores as Record<string, number> | undefined;
              const v = scores?.[key] ?? 0;
              return `${padX + i * stepX},${yScale(v)}`;
            })
            .join(" ");
          return (
            <polyline
              key={key}
              points={points}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={0.85}
            />
          );
        })}

        {/* X 軸の最初と最後の日付 */}
        <text x={padX} y={H - 2} fontSize={7} fill="#aaa" fontWeight="700">
          {new Date(series[0].recorded_at).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}
        </text>
        <text x={W - padX} y={H - 2} fontSize={7} fill="#aaa" fontWeight="700" textAnchor="end">
          {new Date(series[series.length - 1].recorded_at).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" })}
        </text>
      </svg>

      {/* 凡例 */}
      <div className="flex gap-2 mt-2 flex-wrap">
        {DIMS.map(({ key, label, color }) => {
          const lastScores = series[series.length - 1].score_data?.scores as Record<string, number> | undefined;
          const firstScores = series[0].score_data?.scores as Record<string, number> | undefined;
          const last = lastScores?.[key] ?? 0;
          const first = firstScores?.[key] ?? 0;
          const diff = last - first;
          return (
            <div key={key} className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-[9px] font-bold text-[#555]">{label}</span>
              <span className={`text-[9px] font-extrabold tabular-nums ${diff > 0 ? "text-green-600" : diff < 0 ? "text-red-500" : "text-[#aaa]"}`}>
                {diff > 0 ? `+${diff}` : diff}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
