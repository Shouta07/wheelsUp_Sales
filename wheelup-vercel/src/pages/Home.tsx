import { useGamification } from "../gamification/GamificationProvider";
import { syncPipedriveDeals, syncPipedriveActivities } from "../api/client";
import StatsOverview from "../components/gamification/StatsOverview";
import SkillPath from "../components/gamification/SkillPath";
import DailyQuests from "../components/gamification/DailyQuests";
import ConsultantRanking from "../components/gamification/ConsultantRanking";
import CoachingPanel from "../components/gamification/CoachingPanel";
import PlaybookPanel from "../components/gamification/PlaybookPanel";
import Achievements from "../components/gamification/Achievements";
import { useState } from "react";

export default function Home() {
  const { state, currentUser, pipedriveData, myMetrics, loading, refreshPipedriveData, earnXp, unlockAchievement, progressQuest } = useGamification();
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await Promise.all([syncPipedriveDeals(), syncPipedriveActivities()]);
      await refreshPipedriveData();
    } catch { /* preview mode */ }
    setSyncing(false);
  };

  const handleDemoAction = (action: string) => {
    earnXp(action);
    const questMap: Record<string, string[]> = {
      checklist_item: ["q_checklist_3", "q_checklist_5"],
      ai_briefing: ["q_briefing"],
      meeting_logged: ["q_meeting"],
      job_match: ["q_match"],
      knowledge_view: ["q_knowledge"],
      recommendation_created: ["q_recommendation"],
      status_update: ["q_status"],
    };
    (questMap[action] || []).forEach((qid) => progressQuest(qid));
    if (action === "checklist_item" && !state.achievements.find((a) => a.id === "first_check")?.unlocked) {
      unlockAchievement("first_check");
    }
    if (state.totalXp >= 990) unlockAchievement("xp_1000");
    if (state.streak >= 7) unlockAchievement("streak_7");
  };

  const hasPipedriveData = pipedriveData && pipedriveData.consultants.length > 0;

  return (
    <div className="min-h-screen bg-[#f7f7f7]">
      <div className="mx-auto max-w-6xl px-4 py-6">

        {/* Sync bar */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-black text-[#4b4b4b]">
              {currentUser ? `${currentUser}さん` : "ダッシュボード"}
            </h1>
            {myMetrics && (
              <p className="text-xs font-bold text-[#afafaf] mt-0.5">
                成約 {myMetrics.deals_won}件 | 活動 {myMetrics.total_activities}件 | 成約率 {myMetrics.conversion_rate}%
              </p>
            )}
          </div>
          <button
            onClick={handleSync}
            disabled={syncing || loading}
            className="btn-duo btn-duo-blue !px-4 !py-2 !text-xs"
          >
            {syncing ? "同期中..." : "Pipedrive同期"}
          </button>
        </div>

        {/* Main 3-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] gap-6">

          {/* LEFT */}
          <aside className="hidden lg:flex flex-col gap-5">
            <StatsOverview />
            <SkillPath />
          </aside>

          {/* CENTER */}
          <main className="space-y-5">
            {/* Coaching (real data or prompt to sync) */}
            <CoachingPanel />

            {/* Leader playbook extraction */}
            <PlaybookPanel />

            {/* Weekly activity comparison */}
            {hasPipedriveData && myMetrics && (
              <div className="card-duo p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-duo-blue flex items-center justify-center" style={{ borderBottom: "2px solid #1899d6" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg>
                  </div>
                  <span className="text-base font-extrabold text-[#4b4b4b]">今週のパフォーマンス</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "今週の活動", value: myMetrics.activities_this_week, prev: myMetrics.activities_last_week, unit: "件" },
                    { label: "成約率", value: myMetrics.conversion_rate, prev: pipedriveData.team_avg.conversion_rate, unit: "%", vsLabel: "チーム平均" },
                    { label: "Deal進行中", value: myMetrics.deals_open, unit: "件" },
                    { label: "成約金額", value: Math.round(myMetrics.won_value / 10000), unit: "万円" },
                  ].map((m) => {
                    const delta = m.prev !== undefined ? m.value - m.prev : null;
                    return (
                      <div key={m.label} className="rounded-2xl bg-[#f7f7f7] p-3 text-center">
                        <div className="text-xl font-black text-[#4b4b4b]">
                          {typeof m.value === "number" ? m.value.toLocaleString() : m.value}
                          <span className="text-xs text-[#afafaf] font-bold">{m.unit}</span>
                        </div>
                        <div className="text-[10px] font-bold text-[#afafaf]">{m.label}</div>
                        {delta !== null && (
                          <div className={`text-[10px] font-extrabold mt-0.5 ${
                            delta > 0 ? "text-duo-green" : delta < 0 ? "text-duo-red" : "text-[#afafaf]"
                          }`}>
                            {delta > 0 ? `+${delta}` : delta} vs {m.vsLabel || "先週"}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Demo actions (when no Pipedrive data) */}
            {!hasPipedriveData && (
              <div className="card-duo p-5">
                <div className="flex items-center gap-2 mb-1">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#4b4b4b"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                  <span className="text-base font-extrabold text-[#4b4b4b]">アクションでXPを獲得</span>
                </div>
                <p className="text-xs font-bold text-[#afafaf] mb-4">Pipedrive連携後は自動でXPが加算されます。今はデモモードです。</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {[
                    { action: "checklist_item", label: "チェック完了", xp: 10, color: "#58CC02", dark: "#46a302" },
                    { action: "ai_briefing", label: "AI ブリーフィング", xp: 15, color: "#CE82FF", dark: "#a85fd6" },
                    { action: "meeting_logged", label: "面談を記録", xp: 30, color: "#1CB0F6", dark: "#1899D6" },
                    { action: "job_match", label: "求人マッチ", xp: 15, color: "#FF9600", dark: "#d97f00" },
                    { action: "recommendation_created", label: "推薦を作成", xp: 20, color: "#FF4B4B", dark: "#d93636" },
                    { action: "knowledge_view", label: "知識を閲覧", xp: 5, color: "#4b4b4b", dark: "#333" },
                  ].map(({ action, label, xp, color, dark }) => (
                    <button
                      key={action}
                      onClick={() => handleDemoAction(action)}
                      className="btn-duo text-left flex flex-col gap-0.5 !px-4 !py-3 !rounded-xl"
                      style={{ backgroundColor: color, borderBottomColor: dark }}
                    >
                      <span className="text-white text-xs font-extrabold">{label}</span>
                      <span className="text-white/70 text-[10px] font-bold">+{xp} XP</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Activity history */}
            {state.xpHistory.length > 0 && (
              <div className="card-duo p-5">
                <span className="text-base font-extrabold text-[#4b4b4b]">最近のアクティビティ</span>
                <div className="mt-3">
                  {[...state.xpHistory].reverse().slice(0, 8).map((ev, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-[#f0f0f0] last:border-0">
                      <span className="text-sm font-bold text-[#777]">{
                        ({
                          checklist_item: "チェックリスト完了", ai_briefing: "AIブリーフィング",
                          meeting_logged: "面談記録", job_match: "求人マッチ",
                          recommendation_created: "推薦作成", knowledge_view: "業界知識閲覧",
                          status_update: "ステータス更新", candidate_placed: "成約",
                        } as Record<string, string>)[ev.action] || ev.action
                      }</span>
                      <span className="text-sm font-black text-duo-green">+{ev.xp}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </main>

          {/* RIGHT */}
          <aside className="space-y-5">
            <DailyQuests />
            <ConsultantRanking />
            <Achievements />
          </aside>
        </div>
      </div>
    </div>
  );
}
