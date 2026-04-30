import { useGamification } from "../../gamification/GamificationProvider";
import { getLeagueInfo, getLevelProgress } from "../../gamification/config";

export default function StatsOverview() {
  const { state } = useGamification();
  const leagueInfo = getLeagueInfo(state.league);
  const { progress, current, next } = getLevelProgress(state.totalXp);

  const r = 52;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference - (progress / 100) * circumference;

  return (
    <div className="card-duo p-6">
      {/* Level ring */}
      <div className="flex justify-center mb-5">
        <div className="relative w-32 h-32">
          <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
            <circle className="progress-ring-track" cx="60" cy="60" r={r} strokeWidth="10" />
            <circle
              className="progress-ring-fill"
              cx="60" cy="60" r={r} strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-black text-[#4b4b4b]">{state.level}</span>
            <span className="text-[10px] font-extrabold text-[#afafaf] uppercase tracking-widest">Level</span>
          </div>
        </div>
      </div>

      {/* XP to next level */}
      <div className="text-center mb-5">
        <span className="text-xs font-bold text-[#afafaf]">次のレベルまで </span>
        <span className="text-sm font-black text-duo-green">{next - state.totalXp} XP</span>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2.5">
        {[
          { label: "Total XP", value: state.totalXp.toLocaleString(), color: "text-duo-green", bg: "bg-duo-green/8" },
          { label: "ストリーク", value: `${state.streak}日`, color: "text-duo-orange", bg: "bg-duo-orange/8" },
          { label: "今日", value: `${state.todayXp} XP`, color: "text-duo-blue", bg: "bg-duo-blue/8" },
          { label: "リーグ", value: leagueInfo.label, color: "text-duo-purple", bg: "bg-duo-purple/8", icon: leagueInfo.icon },
        ].map((s) => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-3 text-center`}>
            {"icon" in s && s.icon && <span className="text-sm">{s.icon}</span>}
            <div className={`text-lg font-black ${s.color}`}>{s.value}</div>
            <div className="text-[10px] font-bold text-[#afafaf] uppercase tracking-wider">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Weekly goal */}
      <div className="mt-4 pt-4 border-t-2 border-[#f0f0f0]">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs font-extrabold text-[#4b4b4b]">週間目標</span>
          <span className="text-xs font-black text-duo-green">{state.weeklyXp}/200 XP</span>
        </div>
        <div className="h-3 bg-[#e5e5e5] rounded-full overflow-hidden">
          <div
            className="h-full bg-duo-green rounded-full transition-all duration-700"
            style={{ width: `${Math.min((state.weeklyXp / 200) * 100, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
