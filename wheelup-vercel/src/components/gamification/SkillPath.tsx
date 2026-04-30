import { useNavigate } from "react-router-dom";

interface PhaseNode {
  phase: number;
  label: string;
  route: string;
  color: string;
  darkColor: string;
  done: boolean;
}

const PHASES: PhaseNode[] = [
  { phase: 1, label: "準備", route: "/prep", color: "#58CC02", darkColor: "#46a302", done: false },
  { phase: 2, label: "面談", route: "/meeting", color: "#1CB0F6", darkColor: "#1899D6", done: false },
  { phase: 3, label: "直後", route: "/after", color: "#FF9600", darkColor: "#d97f00", done: false },
  { phase: 4, label: "成約", route: "/closing", color: "#CE82FF", darkColor: "#a85fd6", done: false },
];

const PATH_OFFSETS = [0, 60, 0, -60, 0];

export default function SkillPath() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center py-6 px-4">
      {/* Section header */}
      <div className="card-duo px-5 py-3 mb-8 inline-flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-duo-green flex items-center justify-center" style={{ borderBottom: "2px solid #46a302" }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
        </div>
        <span className="text-sm font-extrabold text-[#4b4b4b]">セールスパス</span>
      </div>

      <div className="relative flex flex-col items-center" style={{ minHeight: PHASES.length * 120 }}>
        {PHASES.map((phase, idx) => {
          const offset = PATH_OFFSETS[idx];
          const isLast = idx === PHASES.length - 1;

          return (
            <div key={phase.phase} className="relative flex flex-col items-center" style={{ marginLeft: offset }}>
              {/* Connector line */}
              {idx > 0 && (
                <div className="w-1 h-8 rounded-full bg-[#e5e5e5] -mt-1 mb-1" />
              )}

              {/* Node */}
              <button
                onClick={() => navigate(phase.route)}
                className="node-circle w-[72px] h-[72px] group"
                style={{
                  backgroundColor: phase.color,
                  borderBottomColor: phase.darkColor,
                }}
              >
                <div className="flex flex-col items-center">
                  <span className="text-white text-2xl font-black leading-none">{phase.phase}</span>
                </div>

                {/* Tooltip */}
                <div className="absolute -bottom-9 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  <div
                    className="px-3 py-1 rounded-xl text-xs font-extrabold text-white whitespace-nowrap"
                    style={{ backgroundColor: phase.color }}
                  >
                    {phase.label}
                  </div>
                </div>
              </button>

              {/* Phase label (below) */}
              <span className="mt-2 text-xs font-bold text-[#afafaf] uppercase tracking-wider">
                {phase.label}
              </span>

              {/* Spacer */}
              {!isLast && <div className="h-4" />}
            </div>
          );
        })}

        {/* Final crown */}
        <div className="mt-4 flex flex-col items-center" style={{ marginLeft: PATH_OFFSETS[PHASES.length] || 0 }}>
          <div className="w-1 h-6 rounded-full bg-[#e5e5e5]" />
          <div className="w-14 h-14 rounded-full bg-[#FFC800] flex items-center justify-center" style={{ borderBottom: "5px solid #d9a800" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.6 18.6 20 18 20H6C5.4 20 5 19.6 5 19V18H19V19Z"/>
            </svg>
          </div>
          <span className="mt-2 text-xs font-extrabold text-duo-yellow">成約ゴール</span>
        </div>
      </div>
    </div>
  );
}
