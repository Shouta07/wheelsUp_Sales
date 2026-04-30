import { useGamification } from "../gamification/GamificationProvider";
import StatsOverview from "../components/gamification/StatsOverview";
import SkillPath from "../components/gamification/SkillPath";
import DailyQuests from "../components/gamification/DailyQuests";
import Achievements from "../components/gamification/Achievements";
import Leaderboard from "../components/gamification/Leaderboard";

export default function Home() {
  const { state, earnXp, unlockAchievement, progressQuest } = useGamification();

  const handleAction = (action: string) => {
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

  return (
    <div className="min-h-screen bg-[#f7f7f7]">
      <div className="mx-auto max-w-6xl px-4 py-8">

        {/* Duolingo 3-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] gap-8">

          {/* LEFT: Navigation sidebar */}
          <aside className="hidden lg:flex flex-col gap-5">
            <StatsOverview />

            {/* Quick nav */}
            <div className="card-duo p-4 space-y-2">
              <span className="text-xs font-extrabold text-[#afafaf] uppercase tracking-wider px-1">ツール</span>
              {[
                { label: "推薦管理", href: "/recommendations", color: "#1CB0F6" },
                { label: "企業リスト", href: "/companies", color: "#CE82FF" },
                { label: "求人検索", href: "/jobs", color: "#FF9600" },
                { label: "業界知識", href: "/industry", color: "#58CC02" },
              ].map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[#f7f7f7] transition-colors group"
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: item.color, borderBottom: "2px solid rgba(0,0,0,0.15)" }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
                      <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/>
                    </svg>
                  </div>
                  <span className="text-sm font-bold text-[#4b4b4b] group-hover:text-[#3c3c3c]">{item.label}</span>
                </a>
              ))}
            </div>
          </aside>

          {/* CENTER: Skill Path */}
          <main>
            <SkillPath />

            {/* Action buttons */}
            <div className="mt-6 card-duo p-5">
              <div className="flex items-center gap-2 mb-4">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#4b4b4b">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
                <span className="text-base font-extrabold text-[#4b4b4b]">クイックアクション</span>
              </div>
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
                    onClick={() => handleAction(action)}
                    className="btn-duo text-left flex flex-col gap-0.5 !px-4 !py-3 !rounded-xl"
                    style={{ backgroundColor: color, borderBottomColor: dark }}
                  >
                    <span className="text-white text-xs font-extrabold">{label}</span>
                    <span className="text-white/70 text-[10px] font-bold">+{xp} XP</span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-[#afafaf] text-center mt-3 font-bold">
                各フェーズでの作業により自動的にXPが加算されます
              </p>
            </div>

            {/* Recent Activity */}
            {state.xpHistory.length > 0 && (
              <div className="mt-5 card-duo p-5">
                <span className="text-base font-extrabold text-[#4b4b4b]">最近のアクティビティ</span>
                <div className="mt-3 space-y-0">
                  {[...state.xpHistory].reverse().slice(0, 8).map((ev, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-[#f0f0f0] last:border-0">
                      <span className="text-sm font-bold text-[#777]">{
                        ({
                          checklist_item: "チェックリスト完了",
                          ai_briefing: "AI ブリーフィング",
                          meeting_logged: "面談記録",
                          job_match: "求人マッチ",
                          recommendation_created: "推薦作成",
                          knowledge_view: "業界知識閲覧",
                          status_update: "ステータス更新",
                          meeting_notes: "メモ追加",
                          candidate_placed: "成約",
                          phase_complete: "フェーズ完了",
                        } as Record<string, string>)[ev.action] || ev.action
                      }</span>
                      <span className="text-sm font-black text-duo-green">+{ev.xp}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </main>

          {/* RIGHT: Quests + Social */}
          <aside className="space-y-5">
            <DailyQuests />
            <Leaderboard />
            <Achievements />
          </aside>
        </div>
      </div>
    </div>
  );
}
