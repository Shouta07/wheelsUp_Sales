import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMeetings, type MeetingTranscript } from "../../api/client";
import { TEAM_MEMBERS } from "../../lib/team";

/**
 * メンバー成長オーバービュー (リーダー専用)。
 * 西村 FB 2026-06-06 / 小林 FB: リーダー画面では自分の成長ではなく
 * 「各メンバーがどう伸びているか」を一覧で見たい。
 * - 全メンバー面談 (is_leader=false) を取得し consultant_name でグルーピング
 * - 各メンバー: 採点数 / 最新総合点 / 初回→最新の伸び / 5 軸の最新値と伸び
 */
const DIMS = [
  { key: "needs", label: "ニーズ", color: "#1CB0F6" },
  { key: "proposal", label: "提案", color: "#58CC02" },
  { key: "trust", label: "信頼", color: "#CE82FF" },
  { key: "closing", label: "前進", color: "#FF9600" },
  { key: "intel", label: "情報", color: "#FF4B4B" },
] as const;

const gradeColor = (total: number) =>
  total >= 40 ? "#58CC02" : total >= 35 ? "#1CB0F6" : total >= 25 ? "#FF9600" : "#FF4B4B";
const gradeOf = (total: number) =>
  total >= 40 ? "S" : total >= 35 ? "A" : total >= 25 ? "B" : total >= 15 ? "C" : "D";

export default function MemberGrowthOverview() {
  const { data, isLoading } = useQuery({
    queryKey: ["meetings", "all-members"],
    queryFn: () => fetchMeetings(undefined, undefined, undefined, false),
  });

  const perMember = useMemo(() => {
    const members = TEAM_MEMBERS.filter((m) => m.role === "member");
    const all = (data?.transcripts || []) as MeetingTranscript[];
    return members.map((mem) => {
      const scored = all
        .filter((m) => m.consultant_name === mem.name && m.score_data?.scores)
        .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
      const totalMeetings = all.filter((m) => m.consultant_name === mem.name).length;
      const first = scored[0]?.score_data;
      const last = scored[scored.length - 1]?.score_data;
      return { mem, scored, totalMeetings, first, last };
    });
  }, [data]);

  return (
    <div className="rounded-2xl bg-white border-2 border-[#e5e5e5] p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-black text-[#4b4b4b]">📊 メンバーの成長</h2>
        <span className="text-[10px] font-bold text-[#afafaf]">採点済みの面談から自動集計</span>
      </div>

      {isLoading ? (
        <p className="text-xs font-bold text-[#aaa] py-4 text-center">読み込み中…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {perMember.map(({ mem, scored, totalMeetings, first, last }) => {
            const hasData = !!last;
            const totalScore = last?.total ?? 0;
            const totalDiff = first && last ? (last.total - first.total) : 0;
            return (
              <div key={mem.name} className="rounded-xl border border-[#eee] p-3">
                {/* ヘッダー: メンバー名 + 総合点 */}
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-black text-white shrink-0"
                    style={{ backgroundColor: mem.color }}
                  >
                    {mem.name.slice(0, 1)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-extrabold text-[#4b4b4b]">{mem.name}</div>
                    <div className="text-[10px] font-bold text-[#afafaf]">
                      採点 {scored.length} 件 / 面談 {totalMeetings} 件
                    </div>
                  </div>
                  {hasData ? (
                    <div className="text-right shrink-0">
                      <div className="flex items-center gap-1">
                        <span className="text-lg font-black tabular-nums" style={{ color: gradeColor(totalScore) }}>
                          {totalScore}
                        </span>
                        <span className="text-[10px] font-bold text-[#aaa]">/50</span>
                        <span
                          className="text-[10px] font-black px-1.5 py-0.5 rounded text-white"
                          style={{ backgroundColor: gradeColor(totalScore) }}
                        >
                          {gradeOf(totalScore)}
                        </span>
                      </div>
                      {scored.length >= 2 && (
                        <div className={`text-[10px] font-extrabold tabular-nums ${
                          totalDiff > 0 ? "text-green-600" : totalDiff < 0 ? "text-red-500" : "text-[#aaa]"
                        }`}>
                          初回比 {totalDiff > 0 ? `+${totalDiff}` : totalDiff}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-[10px] font-bold text-[#ccc] shrink-0">未採点</span>
                  )}
                </div>

                {/* 5 軸の最新値 + 伸び */}
                {hasData && (
                  <div className="space-y-1">
                    {DIMS.map(({ key, label, color }) => {
                      const lastScores = last?.scores as Record<string, number> | undefined;
                      const firstScores = first?.scores as Record<string, number> | undefined;
                      const v = lastScores?.[key] ?? 0;
                      const f = firstScores?.[key] ?? 0;
                      const diff = v - f;
                      return (
                        <div key={key} className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-[#777] w-10 shrink-0">{label}</span>
                          <div className="flex-1 h-2 rounded-full bg-[#f0f0f0] overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${v * 10}%`, backgroundColor: color }} />
                          </div>
                          <span className="text-[10px] font-extrabold tabular-nums text-[#555] w-6 text-right shrink-0">{v}</span>
                          {scored.length >= 2 && (
                            <span className={`text-[9px] font-extrabold tabular-nums w-6 text-right shrink-0 ${
                              diff > 0 ? "text-green-600" : diff < 0 ? "text-red-500" : "text-[#ccc]"
                            }`}>
                              {diff > 0 ? `+${diff}` : diff === 0 ? "±0" : diff}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
