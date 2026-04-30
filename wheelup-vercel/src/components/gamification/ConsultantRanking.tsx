import { useGamification } from "../../gamification/GamificationProvider";
import { getLevel } from "../../gamification/config";

export default function ConsultantRanking() {
  const { pipedriveData, myMetrics, setCurrentUser } = useGamification();

  if (!pipedriveData || pipedriveData.consultants.length === 0) {
    return (
      <div className="card-duo p-5">
        <span className="text-base font-extrabold text-[#4b4b4b]">コンサルタントランキング</span>
        <div className="mt-4 py-8 text-center">
          <p className="text-sm font-bold text-[#afafaf]">Pipedriveを同期するとランキングが表示されます</p>
          <p className="text-xs text-[#d0d0d0] mt-1">推薦管理 → Pipedrive同期を実行</p>
        </div>
      </div>
    );
  }

  const sorted = [...pipedriveData.consultants].sort((a, b) => b.xp - a.xp);

  return (
    <div className="card-duo p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-base font-extrabold text-[#4b4b4b]">コンサルタントランキング</span>
        <span className="text-xs font-bold text-[#afafaf]">{sorted.length}名</span>
      </div>

      <div className="space-y-2">
        {sorted.map((c, idx) => {
          const isMe = c.name === myMetrics?.name;
          const level = getLevel(c.xp);
          const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null;
          const weekDelta = c.activities_this_week - c.activities_last_week;

          return (
            <button
              key={c.name}
              onClick={() => setCurrentUser(c.name)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl transition-all text-left ${
                isMe
                  ? "bg-duo-green/8 border-2 border-duo-green"
                  : "hover:bg-[#f7f7f7] border-2 border-transparent"
              }`}
            >
              {/* Rank */}
              <div className="w-8 text-center shrink-0">
                {medal ? (
                  <span className="text-lg">{medal}</span>
                ) : (
                  <span className="text-sm font-black text-[#afafaf]">{idx + 1}</span>
                )}
              </div>

              {/* Level badge */}
              <div
                className="w-8 h-8 rounded-full bg-duo-green flex items-center justify-center text-white text-[11px] font-black shrink-0"
                style={{ borderBottom: "3px solid #46a302" }}
              >
                {level}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-[#4b4b4b] truncate">
                  {c.name}
                  {isMe && <span className="text-duo-green ml-1 text-xs">(You)</span>}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-xs font-bold text-[#afafaf]">{c.xp.toLocaleString()} XP</span>
                  <span className="text-[10px] font-bold text-[#d0d0d0]">
                    成約{c.deals_won} | 活動{c.total_activities}
                  </span>
                </div>
              </div>

              {/* Weekly trend */}
              <div className="text-right shrink-0">
                <div className="text-xs font-bold text-duo-orange">🔥{c.streak_days}</div>
                <div className={`text-[10px] font-extrabold ${
                  weekDelta > 0 ? "text-duo-green" : weekDelta < 0 ? "text-duo-red" : "text-[#afafaf]"
                }`}>
                  {weekDelta > 0 ? `↑${weekDelta}` : weekDelta < 0 ? `↓${Math.abs(weekDelta)}` : "→"}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Team avg */}
      <div className="mt-4 pt-3 border-t-2 border-[#f0f0f0] grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="text-sm font-black text-[#4b4b4b]">{pipedriveData.team_avg.activities_per_week}</div>
          <div className="text-[9px] font-bold text-[#afafaf] uppercase">週間平均活動</div>
        </div>
        <div>
          <div className="text-sm font-black text-[#4b4b4b]">{pipedriveData.team_avg.conversion_rate}%</div>
          <div className="text-[9px] font-bold text-[#afafaf] uppercase">平均成約率</div>
        </div>
        <div>
          <div className="text-sm font-black text-[#4b4b4b]">{pipedriveData.team_avg.avg_deals_won}</div>
          <div className="text-[9px] font-bold text-[#afafaf] uppercase">平均成約数</div>
        </div>
      </div>
    </div>
  );
}
