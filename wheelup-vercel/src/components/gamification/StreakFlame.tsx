import { useGamification } from "../../gamification/GamificationProvider";

export default function StreakFlame() {
  const { state } = useGamification();
  const isHot = state.streak >= 7;

  return (
    <div className="flex items-center gap-1 group relative">
      <span
        className={`text-xl transition-transform ${isHot ? "animate-bounce" : ""}`}
        style={{ filter: state.streak > 0 ? "none" : "grayscale(1)" }}
      >
        🔥
      </span>
      <span className={`text-sm font-black ${state.streak > 0 ? "text-duo-orange" : "text-gray-300"}`}>
        {state.streak}
      </span>
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-lg z-50">
        {state.streak}日連続 | 最長 {state.longestStreak}日
      </div>
    </div>
  );
}
