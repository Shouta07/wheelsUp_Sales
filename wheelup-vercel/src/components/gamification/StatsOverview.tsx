import { useGamification } from "../../gamification/GamificationProvider";
import { getLeagueInfo, getLevelProgress } from "../../gamification/config";

export default function StatsOverview() {
  const { state } = useGamification();
  const leagueInfo = getLeagueInfo(state.league);
  const { progress } = getLevelProgress(state.totalXp);

  const circumference = 2 * Math.PI * 42;
  const dashOffset = circumference - (progress / 100) * circumference;

  return (
    <div className="rounded-2xl bg-white border-2 border-gray-100 p-5 shadow-duo">
      <h3 className="text-lg font-black text-gray-800 mb-4 text-center">ステータス</h3>

      <div className="flex items-center justify-center mb-4">
        <div className="relative w-28 h-28">
          <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#e5e7eb" strokeWidth="8" />
            <circle
              cx="50" cy="50" r="42" fill="none"
              stroke="#58CC02" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-black text-gray-900">{state.level}</span>
            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">LEVEL</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-duo-green/10 p-3 text-center">
          <div className="text-xl font-black text-duo-green">{state.totalXp.toLocaleString()}</div>
          <div className="text-[10px] font-bold text-gray-400 uppercase">Total XP</div>
        </div>
        <div className="rounded-xl bg-duo-orange/10 p-3 text-center">
          <div className="text-xl font-black text-duo-orange">🔥 {state.streak}</div>
          <div className="text-[10px] font-bold text-gray-400 uppercase">Streak</div>
        </div>
        <div className="rounded-xl bg-duo-blue/10 p-3 text-center">
          <div className="text-xl font-black text-duo-blue">{state.todayXp}</div>
          <div className="text-[10px] font-bold text-gray-400 uppercase">Today</div>
        </div>
        <div className="rounded-xl bg-duo-purple/10 p-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <span className="text-lg">{leagueInfo.icon}</span>
            <span className="text-sm font-black" style={{ color: leagueInfo.color }}>{leagueInfo.label}</span>
          </div>
          <div className="text-[10px] font-bold text-gray-400 uppercase">League</div>
        </div>
      </div>

      <div className="mt-4 rounded-xl bg-gray-50 p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold text-gray-500">今週の XP</span>
          <span className="text-xs font-black text-duo-green">{state.weeklyXp} XP</span>
        </div>
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-duo-green to-emerald-400 rounded-full transition-all duration-700"
            style={{ width: `${Math.min((state.weeklyXp / 200) * 100, 100)}%` }}
          />
        </div>
        <div className="text-[9px] text-gray-400 text-right mt-0.5">目標: 200 XP / 週</div>
      </div>
    </div>
  );
}
