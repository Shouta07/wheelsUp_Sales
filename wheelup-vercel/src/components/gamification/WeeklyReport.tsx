import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGamification } from "../../gamification/GamificationProvider";
import { fetchMeetings, type MeetingTranscript } from "../../api/client";

const DIM_LABELS: Record<string, string> = {
  needs: "ニーズ把握",
  proposal: "提案力",
  trust: "信頼構築",
  closing: "クロージング",
  intel: "情報収集",
};

function getWeekStart(date: Date): string {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay() + 1);
  return d.toISOString().slice(0, 10);
}

interface WeekData {
  weekLabel: string;
  avg: number;
  count: number;
  bestDim: string;
  bestVal: number;
}

function buildWeeklyData(meetings: MeetingTranscript[]): WeekData[] {
  const scored = meetings.filter((m) => m.score_data?.scores);
  if (scored.length === 0) return [];

  const weeks = new Map<string, MeetingTranscript[]>();
  for (const m of scored) {
    const wk = getWeekStart(new Date(m.recorded_at));
    if (!weeks.has(wk)) weeks.set(wk, []);
    weeks.get(wk)!.push(m);
  }

  const sorted = [...weeks.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return sorted.slice(-4).map(([wk, ms]) => {
    const totals = ms.map((m) => m.score_data!.total);
    const avg = Math.round(totals.reduce((a, b) => a + b, 0) / totals.length);
    const dimSums: Record<string, number> = { needs: 0, proposal: 0, trust: 0, closing: 0, intel: 0 };
    for (const m of ms) {
      const s = m.score_data!.scores;
      for (const k of Object.keys(dimSums)) dimSums[k] += s[k as keyof typeof s];
    }
    const best = Object.entries(dimSums).sort((a, b) => b[1] - a[1])[0];
    const d = new Date(wk);
    const weekLabel = `${d.getMonth() + 1}/${d.getDate()}〜`;
    return { weekLabel, avg, count: ms.length, bestDim: best[0], bestVal: Math.round(best[1] / ms.length) };
  });
}

export default function WeeklyReport() {
  const { currentUser } = useGamification();

  const { data } = useQuery({
    queryKey: ["meetings", "mine", currentUser],
    queryFn: () => fetchMeetings(undefined, undefined, currentUser, false),
    enabled: !!currentUser,
  });

  const weeks = useMemo(() => buildWeeklyData(data?.transcripts || []), [data]);

  if (weeks.length < 2) {
    return (
      <div className="card-duo p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-duo-green flex items-center justify-center" style={{ borderBottom: "2px solid #46a302" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>
          </div>
          <span className="text-base font-extrabold text-[#4b4b4b]">週間レポート</span>
        </div>
        <div className="rounded-2xl bg-[#f7f7f7] p-4 text-center">
          <p className="text-xs font-bold text-[#afafaf]">2週間分のデータが貯まると成長グラフが表示されます</p>
        </div>
      </div>
    );
  }

  const latest = weeks[weeks.length - 1];
  const prev = weeks[weeks.length - 2];
  const diff = latest.avg - prev.avg;
  const totalMeetings = weeks.reduce((s, w) => s + w.count, 0);

  const gradeFor = (avg: number) => avg >= 40 ? "S" : avg >= 35 ? "A" : avg >= 28 ? "B" : avg >= 20 ? "C" : "D";
  const currentGrade = gradeFor(latest.avg);
  const prevGrade = gradeFor(prev.avg);
  const gradeUp = currentGrade < prevGrade;

  return (
    <div className="card-duo p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-duo-green flex items-center justify-center" style={{ borderBottom: "2px solid #46a302" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>
        </div>
        <span className="text-base font-extrabold text-[#4b4b4b]">週間レポート</span>
      </div>

      {/* Trend bars */}
      <div className="space-y-2 mb-3">
        {weeks.map((w, i) => {
          const isLatest = i === weeks.length - 1;
          const pct = Math.min(100, (w.avg / 50) * 100);
          return (
            <div key={w.weekLabel} className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-[#afafaf] w-14 shrink-0">{w.weekLabel}</span>
              <div className="flex-1 h-5 bg-[#e5e5e5] rounded-full overflow-hidden relative">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: isLatest ? "#58CC02" : "#1CB0F6",
                  }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white drop-shadow-sm">
                  {w.avg}/50 ({w.count}件)
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="rounded-xl bg-[#f7f7f7] p-3 space-y-1.5">
        {diff > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-sm">📈</span>
            <span className="text-xs font-extrabold text-duo-green">先週比 +{diff}点アップ！</span>
          </div>
        )}
        {diff < 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-sm">📉</span>
            <span className="text-xs font-extrabold text-duo-orange">先週比 {diff}点 — 次で取り返そう</span>
          </div>
        )}
        {gradeUp && (
          <div className="flex items-center gap-1.5">
            <span className="text-sm">🎉</span>
            <span className="text-xs font-extrabold text-duo-purple">{prevGrade}→{currentGrade}ランク昇格！</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="text-sm">💪</span>
          <span className="text-xs font-bold text-[#4b4b4b]">
            今週の武器: <span className="text-duo-blue font-extrabold">{DIM_LABELS[latest.bestDim]}</span>（平均{latest.bestVal}点）
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm">🔥</span>
          <span className="text-xs font-bold text-[#777]">累計{totalMeetings}面談をスコアリング済み</span>
        </div>
      </div>
    </div>
  );
}
