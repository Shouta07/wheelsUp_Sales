import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMeetings, type MeetingTranscript } from "../../api/client";
import { isLeader as isLeaderRole } from "../../lib/team";

/**
 * CVR ダッシュボード — 採点スコアとアウトカム (応募/採用) の相関を可視化。
 * 各 5 軸について「スコアの高低 × CVR (次回予約取れた率 / 応募率 / 採用率)」を比較。
 *
 * リーダー専用。アウトカムが 5 件以上記録されたら表示。
 */
const DIMS = [
  { key: "needs", label: "ニーズ深掘り", color: "#1CB0F6" },
  { key: "proposal", label: "提案力", color: "#58CC02" },
  { key: "trust", label: "信頼構築", color: "#CE82FF" },
  { key: "closing", label: "前進", color: "#FF9600" },
  { key: "intel", label: "情報収集", color: "#FF4B4B" },
] as const;

export default function CVRDashboard({ currentUser }: { currentUser: string }) {
  // リーダー専用なのでアクセス制御
  if (!isLeaderRole(currentUser)) return null;

  // 全メンバー面談を取得
  const { data: minesData } = useQuery({
    queryKey: ["meetings", "all-for-cvr"],
    queryFn: async () => {
      // 各メンバーの面談を取得 (リーダーは全員分見える)
      const all: MeetingTranscript[] = [];
      const members = ["小林", "西村", "辻内", "安藤", "村上"];
      for (const m of members) {
        try {
          const r = await fetchMeetings(undefined, undefined, m);
          all.push(...r.transcripts);
        } catch { /* ignore */ }
      }
      return all;
    },
  });

  const stats = useMemo(() => {
    const all = (minesData || []).filter(
      (m) => m.score_data?.scores && m.outcome?.recorded_at,
    );
    if (all.length === 0) return null;

    // 各軸ごとに「スコア高 (7+) と スコア低 (6-)」で CVR を比較
    const result = DIMS.map(({ key, label, color }) => {
      const getScore = (m: MeetingTranscript): number => {
        const scores = m.score_data?.scores as Record<string, number> | undefined;
        return scores?.[key] ?? 0;
      };
      const high = all.filter((m) => getScore(m) >= 7);
      const low = all.filter((m) => getScore(m) < 7);

      const calcRate = (arr: typeof all, field: "next_meeting" | "applied" | "hired") => {
        if (arr.length === 0) return null;
        const yes = arr.filter((m) => m.outcome?.[field]).length;
        return Math.round((yes / arr.length) * 100);
      };

      return {
        key,
        label,
        color,
        highCount: high.length,
        lowCount: low.length,
        highNextRate: calcRate(high, "next_meeting"),
        lowNextRate: calcRate(low, "next_meeting"),
        highAppliedRate: calcRate(high, "applied"),
        lowAppliedRate: calcRate(low, "applied"),
      };
    });
    return { axisStats: result, total: all.length };
  }, [minesData]);

  if (!stats || stats.total < 5) {
    return (
      <div className="card-duo p-4">
        <div className="text-[10px] font-extrabold text-[#777] uppercase tracking-wider mb-2">
          📊 CVR ダッシュボード (リーダー専用)
        </div>
        <p className="text-xs font-bold text-[#aaa]">
          面談アウトカムが {stats?.total ?? 0} / 5 件記録されています。あと {Math.max(0, 5 - (stats?.total ?? 0))} 件で分析開始。
        </p>
      </div>
    );
  }

  return (
    <div className="card-duo p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-extrabold text-[#777] uppercase tracking-wider">
          📊 CVR ダッシュボード ({stats.total} 件)
        </div>
        <span className="text-[9px] font-bold text-[#aaa]">スコア 7+ vs 6- の CVR 比較</span>
      </div>

      <table className="w-full text-[10px]">
        <thead>
          <tr className="text-[9px] uppercase text-[#777] font-extrabold">
            <th className="text-left pb-1">軸</th>
            <th className="text-right pb-1" colSpan={2}>📅 次回予約取れた率</th>
            <th className="text-right pb-1" colSpan={2}>📨 応募進行率</th>
          </tr>
          <tr className="text-[8px] text-[#aaa]">
            <th></th>
            <th className="text-right pb-1">高 (7+)</th>
            <th className="text-right pb-1">低 (6-)</th>
            <th className="text-right pb-1">高 (7+)</th>
            <th className="text-right pb-1">低 (6-)</th>
          </tr>
        </thead>
        <tbody>
          {stats.axisStats.map((s) => (
            <tr key={s.key} className="border-t border-gray-100">
              <td className="py-1.5 font-extrabold" style={{ color: s.color }}>{s.label}</td>
              <td className="text-right tabular-nums font-extrabold text-green-600">
                {s.highNextRate !== null ? `${s.highNextRate}%` : "—"}
                <span className="text-[8px] font-bold text-[#aaa] ml-0.5">({s.highCount})</span>
              </td>
              <td className="text-right tabular-nums font-bold text-[#777]">
                {s.lowNextRate !== null ? `${s.lowNextRate}%` : "—"}
                <span className="text-[8px] font-bold text-[#aaa] ml-0.5">({s.lowCount})</span>
              </td>
              <td className="text-right tabular-nums font-extrabold text-green-600">
                {s.highAppliedRate !== null ? `${s.highAppliedRate}%` : "—"}
              </td>
              <td className="text-right tabular-nums font-bold text-[#777]">
                {s.lowAppliedRate !== null ? `${s.lowAppliedRate}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-[9px] font-bold text-[#aaa] mt-2 leading-relaxed">
        💡 高得点 (7+) と低得点 (6-) で実際の CVR がどれだけ違うかを比較。差が大きい軸ほど "その軸を伸ばすと CVR が伸びる" 指標。
      </p>
    </div>
  );
}
