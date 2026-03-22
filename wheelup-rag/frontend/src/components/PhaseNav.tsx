import { NavLink } from "react-router-dom";

const phases = [
  { to: "/", label: "Dashboard", icon: "📋" },
  { to: "/briefing", label: "商談前", icon: "📝" },
  { to: "/search", label: "商談中", icon: "🔍" },
  { to: "/post-meeting", label: "商談後", icon: "📊" },
] as const;

export default function PhaseNav() {
  return (
    <nav className="bg-white border-b border-gray-200 px-4">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <div className="flex items-center gap-2 py-3">
          <span className="text-lg font-bold text-primary-700">wheelsUp</span>
          <span className="text-xs text-gray-400">商談ナレッジ</span>
        </div>
        <div className="flex gap-1">
          {phases.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                  isActive
                    ? "border-primary-600 text-primary-700"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`
              }
            >
              <span className="mr-1">{icon}</span>
              {label}
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  );
}
