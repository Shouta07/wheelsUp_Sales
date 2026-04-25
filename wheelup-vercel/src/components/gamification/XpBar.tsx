import { useGamification } from "../../gamification/GamificationProvider";
import { getLevelProgress } from "../../gamification/config";

export default function XpBar() {
  const { state } = useGamification();
  const { progress, current, next } = getLevelProgress(state.totalXp);

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-duo-green text-white text-xs font-black shadow-duo">
        {state.level}
      </div>
      <div className="w-24 relative">
        <div className="h-3 bg-gray-200 rounded-full overflow-hidden shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-duo-green to-emerald-400 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between mt-0.5">
          <span className="text-[9px] text-gray-400">{state.totalXp - current}</span>
          <span className="text-[9px] text-gray-400">{next - current}</span>
        </div>
      </div>
    </div>
  );
}
