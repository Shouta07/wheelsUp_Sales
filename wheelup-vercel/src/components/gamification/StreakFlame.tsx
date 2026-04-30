import { useGamification } from "../../gamification/GamificationProvider";

export default function StreakFlame() {
  const { state } = useGamification();
  return (
    <button className="flex items-center gap-1 px-2 py-1 rounded-xl hover:bg-gray-50 transition-colors">
      <span className={`text-lg ${state.streak > 0 ? "animate-streak-pulse" : "grayscale"}`}>
        🔥
      </span>
      <span className={`text-sm font-extrabold ${state.streak > 0 ? "text-duo-orange" : "text-gray-300"}`}>
        {state.streak}
      </span>
    </button>
  );
}
