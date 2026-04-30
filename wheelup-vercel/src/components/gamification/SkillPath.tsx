import { useNavigate } from "react-router-dom";
import { useGamification } from "../../gamification/GamificationProvider";

interface PhaseNode {
  phase: number;
  label: string;
  sublabel: string;
  route: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

const PHASES: PhaseNode[] = [
  { phase: 1, label: "前準備", sublabel: "仮説を立て準備", route: "/", icon: "📋", color: "text-blue-700", bgColor: "bg-blue-500", borderColor: "border-blue-400" },
  { phase: 2, label: "面談・商談", sublabel: "キーワード発見", route: "/meeting", icon: "🤝", color: "text-emerald-700", bgColor: "bg-emerald-500", borderColor: "border-emerald-400" },
  { phase: 3, label: "直後対応", sublabel: "議事録・アクション", route: "/after", icon: "⚡", color: "text-orange-700", bgColor: "bg-orange-500", borderColor: "border-orange-400" },
  { phase: 4, label: "クロージング", sublabel: "推薦〜成約", route: "/closing", icon: "🏆", color: "text-purple-700", bgColor: "bg-purple-500", borderColor: "border-purple-400" },
];

export default function SkillPath() {
  const navigate = useNavigate();
  const { state } = useGamification();

  return (
    <div className="rounded-2xl bg-white border-2 border-gray-100 p-6 shadow-duo">
      <h3 className="text-lg font-black text-gray-800 mb-6 text-center">スキルパス</h3>

      <div className="flex flex-col items-center gap-2">
        {PHASES.map((phase, idx) => {
          const isActive = state.level >= phase.phase;
          const isLocked = state.level < phase.phase;
          const offset = idx % 2 === 0 ? "-translate-x-8" : "translate-x-8";

          return (
            <div key={phase.phase} className="flex flex-col items-center">
              {idx > 0 && (
                <div className={`w-1 h-6 ${isActive ? "bg-duo-green" : "bg-gray-200"} rounded-full`} />
              )}
              <button
                onClick={() => !isLocked && navigate(phase.route)}
                disabled={isLocked}
                className={`relative ${offset} transition-all duration-300 ${
                  isLocked ? "opacity-40 cursor-not-allowed" : "hover:scale-110 cursor-pointer"
                }`}
              >
                <div
                  className={`w-20 h-20 rounded-full flex items-center justify-center text-3xl border-4 shadow-lg transition-all ${
                    isActive
                      ? `${phase.bgColor} ${phase.borderColor} shadow-xl`
                      : "bg-gray-200 border-gray-300"
                  }`}
                >
                  {isLocked ? "🔒" : phase.icon}
                </div>
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-white border-2 border-gray-200 rounded-full px-2 py-0.5 shadow-sm">
                  <span className="text-[10px] font-black text-gray-600">Phase {phase.phase}</span>
                </div>
              </button>
              <div className={`mt-3 text-center ${offset}`}>
                <div className={`text-sm font-black ${isActive ? phase.color : "text-gray-400"}`}>
                  {phase.label}
                </div>
                <div className="text-[10px] text-gray-400">{phase.sublabel}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          onClick={() => navigate("/recommendations")}
          className="rounded-xl bg-gradient-to-r from-duo-blue to-blue-500 p-3 text-center text-white font-bold text-sm shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]"
        >
          🔗 推薦管理
        </button>
        <button
          onClick={() => navigate("/industry")}
          className="rounded-xl bg-gradient-to-r from-duo-purple to-purple-600 p-3 text-center text-white font-bold text-sm shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]"
        >
          🗺 業界知識
        </button>
      </div>
    </div>
  );
}
