import { useGamification } from "../../gamification/GamificationProvider";
import { getLevel, getLeagueInfo, MOCK_LEADERBOARD } from "../../gamification/config";

export default function Leaderboard() {
  const { state } = useGamification();
  const leagueInfo = getLeagueInfo(state.league);

  const entries = [
    ...MOCK_LEADERBOARD.map((e) => ({
      ...e,
      level: getLevel(e.xp),
      isCurrentUser: false,
    })),
    {
      name: "あなた",
      xp: state.totalXp,
      streak: state.streak,
      avatar: "⭐",
      level: state.level,
      isCurrentUser: true,
    },
  ].sort((a, b) => b.xp - a.xp);

  return (
    <div className="rounded-2xl bg-white border-2 border-gray-100 p-5 shadow-duo">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-black text-gray-800">リーグ</h3>
        <div className="flex items-center gap-1">
          <span className="text-lg">{leagueInfo.icon}</span>
          <span className="text-sm font-black" style={{ color: leagueInfo.color }}>
            {leagueInfo.label}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {entries.map((entry, idx) => (
          <div
            key={entry.name}
            className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
              entry.isCurrentUser
                ? "bg-duo-green/10 border-2 border-duo-green"
                : idx < 3
                  ? "bg-gray-50 border-2 border-transparent"
                  : "border-2 border-transparent"
            }`}
          >
            <span className={`w-6 text-center font-black text-sm ${
              idx === 0 ? "text-yellow-500" : idx === 1 ? "text-gray-400" : idx === 2 ? "text-amber-600" : "text-gray-300"
            }`}>
              {idx + 1}
            </span>
            <span className="text-xl">{entry.avatar}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${entry.isCurrentUser ? "text-duo-green" : "text-gray-800"}`}>
                  {entry.name}
                </span>
                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-bold">
                  Lv.{entry.level}
                </span>
              </div>
              <div className="text-xs text-gray-400">{entry.xp.toLocaleString()} XP</div>
            </div>
            <div className="text-right">
              <span className="text-xs text-duo-orange font-bold">🔥 {entry.streak}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
