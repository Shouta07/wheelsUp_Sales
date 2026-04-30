import { useGamification } from "../../gamification/GamificationProvider";
import { getLevelProgress } from "../../gamification/config";

export default function XpBar() {
  const { state } = useGamification();
  const { progress } = getLevelProgress(state.totalXp);

  return (
    <div className="hidden sm:flex items-center gap-2">
      <div
        className="w-7 h-7 rounded-full bg-duo-green flex items-center justify-center text-white text-[11px] font-black"
        style={{ borderBottom: "3px solid #46a302" }}
      >
        {state.level}
      </div>
      <div className="w-20">
        <div className="h-2.5 bg-[#e5e5e5] rounded-full overflow-hidden">
          <div
            className="h-full bg-duo-green rounded-full transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
