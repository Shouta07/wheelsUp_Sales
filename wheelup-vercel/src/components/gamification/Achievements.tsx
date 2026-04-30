import { useGamification } from "../../gamification/GamificationProvider";

const TIER_BG: Record<string, string> = {
  bronze:   "bg-gradient-to-b from-amber-500 to-amber-700",
  silver:   "bg-gradient-to-b from-gray-300 to-gray-500",
  gold:     "bg-gradient-to-b from-yellow-400 to-yellow-600",
  platinum: "bg-gradient-to-b from-cyan-300 to-blue-500",
};

export default function Achievements() {
  const { state } = useGamification();
  const unlocked = state.achievements.filter((a) => a.unlocked).length;

  return (
    <div className="card-duo p-5">
      <div className="flex items-center justify-between mb-4">
        <span className="text-base font-extrabold text-[#4b4b4b]">アチーブメント</span>
        <span className="text-xs font-extrabold text-[#afafaf]">{unlocked}/{state.achievements.length}</span>
      </div>

      <div className="grid grid-cols-4 gap-2.5">
        {state.achievements.map((a) => (
          <button
            key={a.id}
            className={`flex flex-col items-center p-2 rounded-2xl border-2 transition-all group ${
              a.unlocked
                ? "border-[#e5e5e5] hover:border-[#d0d0d0] bg-white"
                : "border-[#f0f0f0] bg-[#f7f7f7]"
            }`}
          >
            <div
              className={`w-11 h-11 rounded-full flex items-center justify-center text-xl mb-1.5 ${
                a.unlocked ? TIER_BG[a.tier] : "bg-[#e5e5e5]"
              }`}
              style={a.unlocked ? { borderBottom: "3px solid rgba(0,0,0,0.15)" } : {}}
            >
              {a.unlocked ? a.icon : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#afafaf">
                  <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
                </svg>
              )}
            </div>
            <span className={`text-[10px] font-bold text-center leading-tight ${
              a.unlocked ? "text-[#4b4b4b]" : "text-[#afafaf]"
            }`}>
              {a.title}
            </span>

            {/* Tooltip */}
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
              <div className="bg-[#4b4b4b] text-white text-[10px] font-bold px-2.5 py-1.5 rounded-xl whitespace-nowrap shadow-lg">
                {a.description}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
