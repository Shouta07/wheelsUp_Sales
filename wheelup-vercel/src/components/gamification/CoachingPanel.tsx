import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { useGamification } from "../../gamification/GamificationProvider";
import { generateCoachingFeedback } from "../../api/client";

export default function CoachingPanel() {
  const { myMetrics, pipedriveData } = useGamification();
  const [coaching, setCoaching] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const topPerformer = pipedriveData?.top_performer;
  const hasData = myMetrics && myMetrics.total_activities > 0;

  const handleGenerate = async () => {
    if (!myMetrics) return;
    setLoading(true);
    try {
      const res = await generateCoachingFeedback(myMetrics.name);
      setCoaching(res.coaching);
    } catch {
      setCoaching("コーチングフィードバックの生成に失敗しました。");
    }
    setLoading(false);
  };

  if (!hasData) {
    return (
      <div className="card-duo p-5">
        <span className="text-base font-extrabold text-[#4b4b4b]">AIコーチング</span>
        <div className="mt-4 py-6 text-center">
          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-[#f7f7f7] flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="#afafaf"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 12h-2v-2h2v2zm0-4h-2V6h2v4z"/></svg>
          </div>
          <p className="text-sm font-bold text-[#afafaf]">Pipedriveデータを同期するとAIコーチングが利用可能</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card-duo p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-duo-purple flex items-center justify-center" style={{ borderBottom: "2px solid #a85fd6" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
          </div>
          <span className="text-base font-extrabold text-[#4b4b4b]">AIコーチング</span>
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="btn-duo btn-duo-green !px-4 !py-2 !text-xs"
        >
          {loading ? "分析中..." : "フィードバック生成"}
        </button>
      </div>

      {/* Comparison with top performer */}
      {topPerformer && topPerformer.name !== myMetrics.name && (
        <div className="rounded-2xl bg-[#f7f7f7] p-4 mb-4">
          <div className="text-xs font-extrabold text-[#afafaf] uppercase tracking-wider mb-3">
            vs トップパフォーマー ({topPerformer.name})
          </div>
          <div className="space-y-2.5">
            {[
              {
                label: "週間活動量",
                mine: myMetrics.activities_this_week,
                top: topPerformer.activities_this_week,
                unit: "件",
              },
              {
                label: "成約率",
                mine: myMetrics.conversion_rate,
                top: topPerformer.conversion_rate,
                unit: "%",
              },
              {
                label: "成約数",
                mine: myMetrics.deals_won,
                top: topPerformer.deals_won,
                unit: "件",
              },
              {
                label: "平均クロージング",
                mine: myMetrics.avg_days_to_close,
                top: topPerformer.avg_days_to_close,
                unit: "日",
                reverse: true,
              },
            ].map(({ label, mine, top, unit, reverse }) => {
              const ratio = top > 0 ? (mine / top) * 100 : 0;
              const isAhead = reverse ? mine < top : mine > top;
              const barColor = isAhead ? "bg-duo-green" : ratio >= 70 ? "bg-duo-yellow" : "bg-duo-red";
              return (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-[#777]">{label}</span>
                    <span className="text-xs font-extrabold text-[#4b4b4b]">
                      {mine}{unit}
                      <span className="text-[#afafaf] mx-1">/</span>
                      <span className="text-[#afafaf]">{top}{unit}</span>
                    </span>
                  </div>
                  <div className="h-2 bg-[#e5e5e5] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                      style={{ width: `${Math.min(reverse ? (top > 0 ? (top / mine || 1) * 100 : 100) : ratio, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Activity breakdown */}
      <div className="rounded-2xl bg-[#f7f7f7] p-4 mb-4">
        <div className="text-xs font-extrabold text-[#afafaf] uppercase tracking-wider mb-3">活動内訳</div>
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: "電話", value: myMetrics.calls, color: "text-duo-green" },
            { label: "面談", value: myMetrics.meetings, color: "text-duo-blue" },
            { label: "メール", value: myMetrics.emails, color: "text-duo-orange" },
            { label: "タスク", value: myMetrics.tasks, color: "text-duo-purple" },
          ].map((a) => (
            <div key={a.label}>
              <div className={`text-lg font-black ${a.color}`}>{a.value}</div>
              <div className="text-[9px] font-bold text-[#afafaf]">{a.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Coaching output */}
      {coaching && (
        <div className="rounded-2xl border-2 border-duo-purple/30 bg-duo-purple/5 p-4">
          <div className="text-xs font-extrabold text-duo-purple uppercase tracking-wider mb-2">
            AIコーチからのフィードバック
          </div>
          <div className="prose prose-sm max-w-none text-sm text-[#4b4b4b] leading-relaxed">
            <ReactMarkdown>{coaching}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
