import { useGamification } from "../../gamification/GamificationProvider";

export default function DailyQuests() {
  const { state } = useGamification();
  const completedCount = state.dailyQuests.filter((q) => q.completed).length;

  return (
    <div className="rounded-2xl bg-white border-2 border-gray-100 p-5 shadow-duo">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-black text-gray-800">デイリークエスト</h3>
        <span className="text-sm font-bold text-duo-green">{completedCount}/3</span>
      </div>

      <div className="space-y-3">
        {state.dailyQuests.map((quest) => {
          const progress = quest.target > 0 ? (quest.current / quest.target) * 100 : 0;
          return (
            <div
              key={quest.id}
              className={`rounded-xl border-2 p-4 transition-all ${
                quest.completed
                  ? "border-duo-green bg-green-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{quest.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-bold ${quest.completed ? "text-duo-green line-through" : "text-gray-800"}`}>
                      {quest.label}
                    </span>
                    <span className="text-xs font-bold text-duo-yellow ml-2">+{quest.xpReward} XP</span>
                  </div>
                  <div className="mt-2 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        quest.completed ? "bg-duo-green" : "bg-duo-blue"
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="text-xs text-gray-400 mt-1 text-right">
                    {quest.current}/{quest.target}
                  </div>
                </div>
                {quest.completed && (
                  <span className="text-2xl">✅</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {completedCount === 3 && (
        <div className="mt-4 rounded-xl bg-gradient-to-r from-duo-green to-emerald-500 p-4 text-center">
          <span className="text-white font-black text-sm">全クエスト達成！ +50 XP ボーナス 🎉</span>
        </div>
      )}
    </div>
  );
}
