import { useState } from "react";
import { GamificationProvider, getSavedUser, clearSavedUser } from "./gamification/GamificationProvider";
import CelebrationOverlay from "./components/gamification/CelebrationOverlay";
import StreakFlame from "./components/gamification/StreakFlame";
import UserSelectPage from "./pages/UserSelectPage";
import Home from "./pages/Home";
import ProspectingApp from "./pages/ra/ProspectingApp";

type Mode = "meeting" | "ra";
const MODE_KEY = "wheelsup_active_mode";
function loadMode(): Mode {
  if (typeof window === "undefined") return "meeting";
  const v = window.localStorage.getItem(MODE_KEY);
  return v === "ra" ? "ra" : "meeting";
}

// 5人チーム運用: サーバAPIが service_role で動くためブラウザ認証は不要。
// ユーザー識別は UserSelectPage で選んだ consultant_name を localStorage に保持して扱う。

function NavBar({
  currentUser, onSwitchUser, mode, onChangeMode,
}: {
  currentUser: string;
  onSwitchUser: () => void;
  mode: Mode;
  onChangeMode: (m: Mode) => void;
}) {
  return (
    <header className="bg-white border-b-2 border-[#e5e5e5] sticky top-0 z-50">
      <div className="mx-auto max-w-5xl flex items-center justify-between h-12 px-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-duo-green flex items-center justify-center" style={{ borderBottom: "2px solid #46a302" }}>
            <span className="text-white text-[10px] font-black">W</span>
          </div>
          <span className="text-sm font-black text-[#4b4b4b]">wheelsUp</span>

          {/* Mode switcher: 面談フィードバック / RA 開拓 */}
          <div className="ml-2 flex rounded-xl border border-[#e5e5e5] overflow-hidden text-[10px] font-black">
            <button
              onClick={() => onChangeMode("meeting")}
              className={`px-2 py-1 transition-colors ${
                mode === "meeting" ? "bg-duo-green text-white" : "text-[#4b4b4b] hover:bg-gray-50"
              }`}
            >
              面談FB
            </button>
            <button
              onClick={() => onChangeMode("ra")}
              className={`px-2 py-1 transition-colors ${
                mode === "ra" ? "bg-duo-blue text-white" : "text-[#4b4b4b] hover:bg-gray-50"
              }`}
            >
              RA開拓
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {mode === "meeting" && <StreakFlame />}
          <button
            onClick={onSwitchUser}
            className="flex items-center gap-1.5 px-2 py-1 rounded-xl border border-[#e5e5e5] hover:bg-red-50 hover:border-red-200 transition-colors group"
            title="ユーザー切替"
          >
            <div className="w-6 h-6 rounded-full bg-duo-blue flex items-center justify-center" style={{ borderBottom: "2px solid #1899d6" }}>
              <span className="text-white text-[10px] font-black">{currentUser[0]}</span>
            </div>
            <span className="text-xs font-bold text-[#4b4b4b]">{currentUser}</span>
            <svg className="w-3.5 h-3.5 text-[#afafaf] group-hover:text-red-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  );
}

export default function App() {
  const [activeUser, setActiveUser] = useState<string | null>(getSavedUser);
  const [mode, setMode] = useState<Mode>(loadMode);

  const changeMode = (m: Mode) => {
    setMode(m);
    if (typeof window !== "undefined") window.localStorage.setItem(MODE_KEY, m);
  };

  if (!activeUser) {
    return (
      <UserSelectPage
        onSelect={(name) => {
          localStorage.setItem("wheelsup_current_user", name);
          setActiveUser(name);
        }}
      />
    );
  }

  return (
    <GamificationProvider userName={activeUser} key={activeUser}>
      <div className="min-h-screen bg-gray-50">
        <CelebrationOverlay />
        <NavBar
          currentUser={activeUser}
          onSwitchUser={() => {
            clearSavedUser();
            setActiveUser(null);
          }}
          mode={mode}
          onChangeMode={changeMode}
        />
        {mode === "meeting" ? <Home /> : <ProspectingApp />}
      </div>
    </GamificationProvider>
  );
}
