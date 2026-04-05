import { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import type { Session } from "@supabase/supabase-js";
import PhaseNav from "./components/PhaseNav";
import Phase1Prep from "./pages/Phase1Prep";
import Phase2Meeting from "./pages/Phase2Meeting";
import Phase3After from "./pages/Phase3After";
import Phase4Closing from "./pages/Phase4Closing";
import Companies from "./pages/Companies";
import JobPostings from "./pages/JobPostings";
import IndustryMap from "./pages/IndustryMap";

/**
 * Supabase Auth ログインページ
 * メールアドレス + マジックリンク（パスワードなし）
 */
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
        <p className="text-sm text-gray-500 mb-6">Sales Enablement Platform</p>

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
            <p className="text-xs text-gray-400 mt-4">
              社内メンバーのメールアドレスを入力してください。
              <br />
              パスワード不要でログインできます。
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      // Supabase 未設定時は Auth スキップ（UI プレビューモード）
      setLoading(false);
      return;
    }

    // 初期セッション取得
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setLoading(false);
    });

    // セッション変更を監視
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (isSupabaseConfigured && !session) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PhaseNav />
      <Routes>
        <Route path="/" element={<Phase1Prep />} />
        <Route path="/meeting" element={<Phase2Meeting />} />
        <Route path="/after" element={<Phase3After />} />
        <Route path="/closing" element={<Phase4Closing />} />
        <Route path="/companies" element={<Companies />} />
        <Route path="/jobs" element={<JobPostings />} />
        <Route path="/industry" element={<IndustryMap />} />
      </Routes>
    </div>
  );
}
