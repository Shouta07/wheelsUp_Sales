import { NavLink } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "../lib/supabase";

const phases = [
  { to: "/", label: "前準備", icon: "①" },
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
        <div className="flex items-center gap-2 py-3">
          <span className="text-lg font-bold text-primary-700">wheelsUp</span>
          <span className="text-xs text-gray-400">Sales Enablement</span>
        </div>
        <div className="flex items-center gap-1">
          {phases.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `px-3 py-3 text-sm font-medium transition-colors border-b-2 ${
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
