import { useGamification } from "../../gamification/GamificationProvider";
import { getLevel, getLeagueInfo, MOCK_LEADERBOARD } from "../../gamification/config";

const RANK_STYLES = [
  "bg-[#FFC800] text-white",
  "bg-[#C0C0C0] text-white",
  "bg-[#CD7F32] text-white",
];

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
    <div className="card-duo p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">{leagueInfo.icon}</span>
          <span className="text-base font-extrabold text-[#4b4b4b]">
            {leagueInfo.label}リーグ
          </span>
        </div>
      </div>

      {/* Entries */}
      <div className="space-y-1.5">
        {entries.map((entry, idx) => (
          <div
            key={entry.name}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all ${
              entry.isCurrentUser
                ? "bg-duo-blue/8 border-2 border-duo-blue"
                : "hover:bg-[#f7f7f7] border-2 border-transparent"
            }`}
          >
            {/* Rank */}
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
              idx < 3 ? RANK_STYLES[idx] : "bg-[#e5e5e5] text-[#afafaf]"
            }`}>
              {idx + 1}
            </div>

            {/* Avatar */}
            <div className="w-9 h-9 rounded-full bg-[#f0f0f0] flex items-center justify-center text-lg shrink-0">
              {entry.avatar}
            </div>

            {/* Name + XP */}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-[#4b4b4b] truncate">
                {entry.name}
                {entry.isCurrentUser && (
                  <span className="text-duo-blue ml-1 text-xs">(You)</span>
                )}
              </div>
              <div className="text-xs font-bold text-[#afafaf]">
                {entry.xp.toLocaleString()} XP
              </div>
            </div>

            {/* Streak */}
            <div className="text-xs font-extrabold text-duo-orange shrink-0">
              🔥{entry.streak}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
