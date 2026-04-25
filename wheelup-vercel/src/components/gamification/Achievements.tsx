import { useGamification } from "../../gamification/GamificationProvider";

const TIER_STYLES: Record<string, string> = {
  bronze: "from-amber-600 to-amber-800",
  silver: "from-gray-300 to-gray-500",
  gold: "from-yellow-400 to-yellow-600",
  platinum: "from-cyan-300 to-blue-500",
};

const TIER_BORDER: Record<string, string> = {
  bronze: "border-amber-300",
  silver: "border-gray-300",
  gold: "border-yellow-300",
  platinum: "border-cyan-300",
};

export default function Achievements() {
  const { state } = useGamification();
  const unlocked = state.achievements.filter((a) => a.unlocked).length;

  return (
    <div className="rounded-2xl bg-white border-2 border-gray-100 p-5 shadow-duo">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-black text-gray-800">アチーブメント</h3>
        <span className="text-sm font-bold text-duo-purple">{unlocked}/{state.achievements.length}</span>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {state.achievements.map((achievement) => (
          <div
            key={achievement.id}
            className={`relative flex flex-col items-center p-3 rounded-xl border-2 transition-all ${
              achievement.unlocked
                ? `${TIER_BORDER[achievement.tier]} bg-white shadow-md`
                : "border-gray-200 bg-gray-50 opacity-40"
            }`}
          >
            <div
              className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${
                achievement.unlocked
                  ? `bg-gradient-to-br ${TIER_STYLES[achievement.tier]} shadow-lg`
                  : "bg-gray-200"
              }`}
            >
              {achievement.unlocked ? achievement.icon : "🔒"}
            </div>
            <span className="text-[10px] font-bold text-gray-700 mt-2 text-center leading-tight">
              {achievement.title}
            </span>
            <span className="text-[9px] text-gray-400 text-center leading-tight mt-0.5">
              {achievement.description}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
