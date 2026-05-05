import { useState, useEffect } from "react";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";
import { GamificationProvider, getSavedUser, clearSavedUser } from "./gamification/GamificationProvider";
import CelebrationOverlay from "./components/gamification/CelebrationOverlay";
import UserSelectPage from "./pages/UserSelectPage";
import Home from "./pages/Home";

function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email) return;
    setLoading(true);
    setError("");
    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (authError) {
      setError(authError.message);
    } else {
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="rounded-xl bg-white shadow-lg border border-gray-200 p-8 max-w-sm w-full text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-1">wheelsUp</h1>
        <p className="text-sm text-gray-500 mb-6">面談フィードバック＆強化システム</p>

        {sent ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-green-50 border border-green-200 p-4">
              <p className="text-sm text-green-800 font-medium">
                ログインリンクを送信しました
              </p>
              <p className="text-xs text-green-600 mt-1">
                {email} のメールを確認してください
              </p>
            </div>
            <button
              onClick={() => setSent(false)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              別のメールアドレスで試す
            </button>
          </div>
        ) : (
          <>
            <input
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              placeholder="メールアドレス"
              className={`w-full rounded-lg border px-4 py-2.5 text-sm mb-3 ${
                error ? "border-red-400 bg-red-50" : "border-gray-300"
              }`}
            />
            {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
            <button
              onClick={handleLogin}
              disabled={loading || !email}
              className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? "送信中…" : "ログインリンクを送信"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function NavBar({ currentUser, onSwitchUser }: { currentUser: string; onSwitchUser: () => void }) {
  return (
    <header className="bg-white border-b-2 border-[#e5e5e5] sticky top-0 z-50">
      <div className="mx-auto max-w-5xl flex items-center justify-between h-12 px-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-duo-green flex items-center justify-center" style={{ borderBottom: "2px solid #46a302" }}>
            <span className="text-white text-[10px] font-black">W</span>
          </div>
          <span className="text-sm font-black text-[#4b4b4b]">wheelsUp</span>
          <span className="text-[10px] font-bold text-[#afafaf] hidden sm:inline">面談フィードバック</span>
        </div>

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
      </div>
    </header>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeUser, setActiveUser] = useState<string | null>(getSavedUser);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f7f7f7] flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-duo-green border-t-transparent rounded-full" />
      </div>
    );
  }

  if (isSupabaseConfigured && !session) {
    return <LoginPage />;
  }

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
        />
        <Home />
      </div>
    </GamificationProvider>
  );
}
