import { NavLink, useLocation } from "react-router-dom";
import { useGamification } from "../gamification/GamificationProvider";

export default function PhaseNav({ onSwitchUser }: { onSwitchUser?: () => void }) {
  const { currentUser } = useGamification();
  const location = useLocation();

  const isHome = location.pathname === "/home" || location.pathname === "/";

  const navItems = [
    { to: "/home", label: "面談FB" },
    { to: "/prep", label: "① 準備" },
    { to: "/meeting", label: "② 面談" },
    { to: "/after", label: "③ 直後" },
    { to: "/closing", label: "④ 成約" },
  ];

  return (
    <header className="bg-white border-b-2 border-[#e5e5e5] sticky top-0 z-50">
      <div className="mx-auto max-w-5xl flex items-center justify-between h-12 px-4">
        {/* Logo */}
        <NavLink to="/home" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-duo-green flex items-center justify-center" style={{ borderBottom: "2px solid #46a302" }}>
            <span className="text-white text-[10px] font-black">W</span>
          </div>
          <span className="text-sm font-black text-[#4b4b4b] hidden sm:inline">wheelsUp</span>
        </NavLink>

        {/* Navigation */}
        <nav className="flex items-center gap-1">
          {navItems.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/home"}
              className={({ isActive }) =>
                `px-3 py-1.5 text-xs font-bold rounded-xl whitespace-nowrap transition-all ${
                  isActive
                    ? "bg-duo-blue/10 text-duo-blue"
                    : "text-[#afafaf] hover:text-[#4b4b4b] hover:bg-gray-50"
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        {currentUser && (
          <button
            onClick={onSwitchUser}
            className="flex items-center gap-1.5 px-2 py-1 rounded-xl hover:bg-gray-50 transition-colors"
            title="ユーザー切替"
          >
            <div className="w-6 h-6 rounded-full bg-duo-blue flex items-center justify-center" style={{ borderBottom: "2px solid #1899d6" }}>
              <span className="text-white text-[10px] font-black">{currentUser[0]}</span>
            </div>
            <span className="text-xs font-bold text-[#4b4b4b] hidden sm:inline">{currentUser}</span>
          </button>
        )}
      </div>
    </header>
  );
}
