import { useGamification } from "../../gamification/GamificationProvider";
import { useQuery } from "@tanstack/react-query";
import { fetchMeetings } from "../../api/client";

export default function StreakFlame() {
  const { state, currentUser } = useGamification();

  const { data } = useQuery({
    queryKey: ["meetings", "mine", currentUser],
    queryFn: () => fetchMeetings(undefined, undefined, currentUser, false),
    enabled: !!currentUser,
  });

  const streak = (() => {
    const scored = (data?.transcripts || []).filter((m) => m.score_data);
    if (scored.length === 0) return state.streak;
    const days = new Set(scored.map((m) => m.recorded_at.slice(0, 10)));
    let count = 0;
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      if (days.has(d.toISOString().slice(0, 10))) count++;
      else if (i > 0) break;
    }
    return Math.max(count, state.streak);
  })();

  return (
    <button className="flex items-center gap-1 px-2 py-1 rounded-xl hover:bg-gray-50 transition-colors" title={`${streak}日連続記録中`}>
      <span className={`text-lg ${streak > 0 ? "animate-streak-pulse" : "grayscale"}`}>
        🔥
      </span>
      <span className={`text-sm font-extrabold ${streak > 0 ? "text-duo-orange" : "text-gray-300"}`}>
        {streak}
      </span>
    </button>
  );
}
