import { NavLink, useLocation } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { useGamification } from "../gamification/GamificationProvider";
import { getLevelProgress, getLeagueInfo } from "../gamification/config";

export default function PhaseNav() {
  const { state } = useGamification();
  const { progress } = getLevelProgress(state.totalXp);
  const location = useLocation();
  const leagueInfo = getLeagueInfo(state.league);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  const isHome = location.pathname === "/home" || location.pathname === "/";

  const navItems = [
    { to: "/home", label: "ホーム", active: isHome },
    { to: "/prep", label: "① 準備" },
    { to: "/meeting", label: "② 面談" },
    { to: "/after", label: "③ 直後" },
    { to: "/closing", label: "④ 成約" },
    { to: "/recommendations", label: "推薦" },
    { to: "/companies", label: "企業" },
    { to: "/jobs", label: "求人" },
    { to: "/industry", label: "知識" },
  ];

  return (
    <header className="bg-white border-b-2 border-[#e5e5e5] sticky top-0 z-50">
      <div className="mx-auto max-w-7xl flex items-center justify-between h-14 px-4">
        {/* Logo + Gamification stats */}
        <div className="flex items-center gap-4">
          <NavLink to="/home" className="flex items-center gap-1.5">
            <div className="w-8 h-8 rounded-lg bg-duo-green flex items-center justify-center" style={{ borderBottom: "3px solid #46a302" }}>
              <span className="text-white text-xs font-black tracking-tighter">W</span>
            </div>
          </NavLink>

          {/* Streak */}
          <button className="flex items-center gap-1 px-2 py-1 rounded-xl hover:bg-gray-50 transition-colors group">
            <span className={`text-lg ${state.streak > 0 ? "animate-streak-pulse" : "grayscale"}`}>
              🔥
            </span>
            <span className={`text-sm font-extrabold ${state.streak > 0 ? "text-duo-orange" : "text-gray-300"}`}>
              {state.streak}
            </span>
          </button>

          {/* League */}
          <button className="flex items-center gap-1 px-2 py-1 rounded-xl hover:bg-gray-50 transition-colors">
            <span className="text-lg">{leagueInfo.icon}</span>
          </button>

          {/* XP Level */}
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
        </div>

        {/* Navigation */}
        <nav className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide">
          {navItems.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/home"}
              className={({ isActive }) =>
                `px-3 py-1.5 text-[13px] font-bold rounded-xl whitespace-nowrap transition-all duration-150 ${
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

        {/* Right */}
        <div className="flex items-center gap-2">
          <div className="text-xs font-bold text-duo-green bg-duo-green/10 px-2.5 py-1 rounded-full">
            {state.totalXp.toLocaleString()} XP
          </div>
          {isSupabaseConfigured && (
            <button
              onClick={handleLogout}
              className="text-xs text-[#afafaf] hover:text-[#4b4b4b] font-bold px-2 py-1 rounded-lg hover:bg-gray-50"
            >
              ログアウト
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
