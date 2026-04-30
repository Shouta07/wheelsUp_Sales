import { useGamification } from "../gamification/GamificationProvider";
import StatsOverview from "../components/gamification/StatsOverview";
import SkillPath from "../components/gamification/SkillPath";
import DailyQuests from "../components/gamification/DailyQuests";
import Achievements from "../components/gamification/Achievements";
import Leaderboard from "../components/gamification/Leaderboard";

export default function Home() {
  const { state, earnXp, unlockAchievement, progressQuest } = useGamification();

  const handleDemoXp = (action: string) => {
    earnXp(action);

    if (action === "checklist_item") {
      progressQuest("q_checklist_3");
      progressQuest("q_checklist_5");
      if (!state.achievements.find((a) => a.id === "first_check")?.unlocked) {
        unlockAchievement("first_check");
      }
    }
    if (action === "ai_briefing") {
      progressQuest("q_briefing");
    }
    if (action === "meeting_logged") {
      progressQuest("q_meeting");
    }
    if (action === "job_match") {
      progressQuest("q_match");
    }
    if (action === "knowledge_view") {
      progressQuest("q_knowledge");
    }
    if (action === "recommendation_created") {
      progressQuest("q_recommendation");
    }

    if (state.totalXp + 10 >= 1000) {
      unlockAchievement("xp_1000");
    }
    if (state.streak >= 7) {
      unlockAchievement("streak_7");
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-black text-gray-900 mb-1">
          おかえりなさい！
        </h1>
        <p className="text-gray-500 font-medium">
          今日もセールススキルを磨いていきましょう
        </p>
      </div>

      {/* Main Grid: Duolingo-style 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Stats + Skill Path */}
        <div className="lg:col-span-3 space-y-6">
          <StatsOverview />
          <SkillPath />
        </div>

        {/* Center Column: Daily Quests + Quick Actions */}
        <div className="lg:col-span-5 space-y-6">
          <DailyQuests />

          {/* Quick XP Actions (Demo) */}
          <div className="rounded-2xl bg-white border-2 border-gray-100 p-5 shadow-duo">
            <h3 className="text-lg font-black text-gray-800 mb-4">クイックアクション</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { action: "checklist_item", label: "チェックリスト", icon: "✅", color: "bg-duo-green hover:bg-green-600" },
                { action: "ai_briefing", label: "AI ブリーフィング", icon: "🤖", color: "bg-duo-blue hover:bg-blue-600" },
                { action: "meeting_logged", label: "面談記録", icon: "📝", color: "bg-duo-orange hover:bg-orange-600" },
                { action: "job_match", label: "求人マッチ", icon: "🔍", color: "bg-duo-purple hover:bg-purple-600" },
                { action: "recommendation_created", label: "推薦作成", icon: "🔗", color: "bg-cyan-500 hover:bg-cyan-600" },
                { action: "knowledge_view", label: "業界知識", icon: "📚", color: "bg-pink-500 hover:bg-pink-600" },
              ].map(({ action, label, icon, color }) => (
                <button
                  key={action}
                  onClick={() => handleDemoXp(action)}
                  className={`${color} text-white rounded-xl p-3 font-bold text-sm shadow-lg hover:shadow-xl transition-all active:scale-95 flex items-center gap-2`}
                >
                  <span className="text-lg">{icon}</span>
                  <div className="text-left">
                    <div className="text-xs font-black">{label}</div>
                    <div className="text-[10px] opacity-80">+{({ checklist_item: 10, ai_briefing: 15, meeting_logged: 30, job_match: 15, recommendation_created: 20, knowledge_view: 5 } as Record<string, number>)[action]} XP</div>
                  </div>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-400 text-center mt-3">
              各フェーズでのアクションで自動的にXPが獲得されます
            </p>
          </div>

          {/* XP History */}
          {state.xpHistory.length > 0 && (
            <div className="rounded-2xl bg-white border-2 border-gray-100 p-5 shadow-duo">
              <h3 className="text-lg font-black text-gray-800 mb-3">最近の活動</h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {[...state.xpHistory].reverse().slice(0, 10).map((event, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                    <span className="text-sm text-gray-600">
                      {event.action in ({ checklist_item: 1, ai_briefing: 1, meeting_logged: 1, job_match: 1, recommendation_created: 1, knowledge_view: 1, status_update: 1, meeting_notes: 1, candidate_placed: 1, phase_complete: 1, daily_quest: 1 })
                        ? ({ checklist_item: "✅ チェックリスト", ai_briefing: "🤖 AI生成", meeting_logged: "📝 面談記録", job_match: "🔍 求人マッチ", recommendation_created: "🔗 推薦作成", knowledge_view: "📚 業界知識", status_update: "📊 ステータス", meeting_notes: "📋 メモ追加", candidate_placed: "🏆 成約！", phase_complete: "🎯 フェーズ完了", daily_quest: "📜 クエスト達成" } as Record<string, string>)[event.action]
                        : event.action
                      }
                    </span>
                    <span className="text-sm font-black text-duo-green">+{event.xp} XP</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Leaderboard + Achievements */}
        <div className="lg:col-span-4 space-y-6">
          <Leaderboard />
          <Achievements />
        </div>
      </div>
    </div>
  );
}
