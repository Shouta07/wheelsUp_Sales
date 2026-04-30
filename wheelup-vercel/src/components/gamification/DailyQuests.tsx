import { useGamification } from "../../gamification/GamificationProvider";

const QUEST_ICONS: Record<string, JSX.Element> = {
  q_checklist_3: <svg width="20" height="20" viewBox="0 0 24 24" fill="#58CC02"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>,
  q_checklist_5: <svg width="20" height="20" viewBox="0 0 24 24" fill="#58CC02"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>,
  q_briefing:    <svg width="20" height="20" viewBox="0 0 24 24" fill="#CE82FF"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>,
  q_meeting:     <svg width="20" height="20" viewBox="0 0 24 24" fill="#1CB0F6"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>,
  q_status:      <svg width="20" height="20" viewBox="0 0 24 24" fill="#FF9600"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z"/></svg>,
  q_match:       <svg width="20" height="20" viewBox="0 0 24 24" fill="#1CB0F6"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>,
  q_knowledge:   <svg width="20" height="20" viewBox="0 0 24 24" fill="#CE82FF"><path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1z"/></svg>,
  q_recommendation: <svg width="20" height="20" viewBox="0 0 24 24" fill="#FF9600"><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>,
};

export default function DailyQuests() {
  const { state } = useGamification();
  const completedCount = state.dailyQuests.filter((q) => q.completed).length;
  const allDone = completedCount === 3;

  return (
    <div className="card-duo p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-duo-yellow flex items-center justify-center" style={{ borderBottom: "2px solid #d9a800" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
          </div>
          <span className="text-base font-extrabold text-[#4b4b4b]">デイリークエスト</span>
        </div>
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-colors ${
                i < completedCount ? "bg-duo-green" : "bg-[#e5e5e5]"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2.5">
        {state.dailyQuests.map((quest) => {
          const pct = quest.target > 0 ? (quest.current / quest.target) * 100 : 0;
          const icon = QUEST_ICONS[quest.id];
          return (
            <div
              key={quest.id}
              className={`flex items-center gap-3 p-3 rounded-2xl border-2 transition-all ${
                quest.completed
                  ? "border-duo-green bg-duo-green/5"
                  : "border-[#e5e5e5] hover:border-[#d0d0d0]"
              }`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                quest.completed ? "bg-duo-green/10" : "bg-[#f7f7f7]"
              }`}>
                {icon || <span className="text-lg">{quest.completed ? "✓" : "?"}</span>}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-sm font-bold ${
                    quest.completed ? "text-duo-green" : "text-[#4b4b4b]"
                  }`}>
                    {quest.label}
                  </span>
                  <span className="text-xs font-extrabold text-duo-yellow shrink-0 ml-2">
                    +{quest.xpReward}
                  </span>
                </div>
                <div className="h-2 bg-[#e5e5e5] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      quest.completed ? "bg-duo-green" : "bg-duo-blue"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {allDone && (
        <div className="mt-4 rounded-2xl bg-duo-green p-3 text-center" style={{ borderBottom: "3px solid #46a302" }}>
          <span className="text-white font-extrabold text-sm">全クエスト達成！ ボーナス獲得</span>
        </div>
      )}
    </div>
  );
}
