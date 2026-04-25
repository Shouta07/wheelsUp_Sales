import { NavLink } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import XpBar from "./gamification/XpBar";
import StreakFlame from "./gamification/StreakFlame";

const phases = [
  { to: "/home", label: "ホーム", icon: "🏠" },
  { to: "/prep", label: "前準備", icon: "①" },
  { to: "/meeting", label: "面談・商談中", icon: "②" },
  { to: "/after", label: "直後対応", icon: "③" },
  { to: "/closing", label: "推薦〜クロージング", icon: "④" },
  { to: "/recommendations", label: "推薦管理", icon: "🔗" },
  { to: "/companies", label: "企業", icon: "🏢" },
  { to: "/jobs", label: "求人", icon: "💼" },
  { to: "/industry", label: "業界知識", icon: "🗺" },
] as const;

export default function PhaseNav() {
  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };

  return (
    <nav className="bg-white border-b border-gray-200 px-4">
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <div className="flex items-center gap-3 py-3">
          <span className="text-lg font-black text-duo-green">wheelsUp</span>
          <XpBar />
          <StreakFlame />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
          {phases.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/home"}
              className={({ isActive }) =>
                `px-3 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
                  isActive
                    ? "border-duo-green text-duo-green"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`
              }
            >
              <span className="mr-1">{icon}</span>
              {label}
            </NavLink>
          ))}
          {isSupabaseConfigured && (
            <button
              onClick={handleLogout}
              className="ml-3 text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
            >
              ログアウト
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
