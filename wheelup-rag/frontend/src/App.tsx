import { useState, useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import PhaseNav from "./components/PhaseNav";
import Dashboard from "./pages/Dashboard";
import Companies from "./pages/Companies";
import CandidatePrep from "./pages/CandidatePrep";
import MeetingAssist from "./pages/MeetingAssist";
import FollowUp from "./pages/FollowUp";
import IndustryMap from "./pages/IndustryMap";
import LearningHub from "./pages/LearningHub";
import Briefing from "./pages/Briefing";
import SearchPanel from "./pages/SearchPanel";
import PostMeeting from "./pages/PostMeeting";

/**
 * 簡易認証ゲート。
 * URL に ?key=<ACCESS_KEY> を付けてアクセスすると認証済みになる。
 * 一度認証されたら sessionStorage に保存されるため、同タブ内では再入力不要。
 * 環境変数 VITE_ACCESS_KEY で設定（未設定ならゲートなし）。
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const requiredKey = import.meta.env.VITE_ACCESS_KEY as string | undefined;
  const [authed, setAuthed] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    // キー未設定 → 認証不要
    if (!requiredKey) {
      setAuthed(true);
      return;
    }
    // sessionStorage に既に保存済み
    if (sessionStorage.getItem("wu_auth") === "1") {
      setAuthed(true);
      return;
    }
    // URL パラメータでキーが渡された場合
    const params = new URLSearchParams(window.location.search);
    const urlKey = params.get("key");
    if (urlKey === requiredKey) {
      sessionStorage.setItem("wu_auth", "1");
      // URLからkeyパラメータを除去（履歴に残さない）
      params.delete("key");
      const clean = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (clean ? `?${clean}` : ""),
      );
      setAuthed(true);
    }
  }, [requiredKey]);

  if (authed) return <>{children}</>;

  const handleSubmit = () => {
    if (keyInput === requiredKey) {
      sessionStorage.setItem("wu_auth", "1");
      setAuthed(true);
    } else {
      setError(true);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="rounded-xl bg-white shadow-lg border border-gray-200 p-8 max-w-sm w-full text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-1">wheelsUp</h1>
        <p className="text-sm text-gray-500 mb-6">アクセスキーを入力してください</p>
        <input
          type="password"
          value={keyInput}
          onChange={(e) => { setKeyInput(e.target.value); setError(false); }}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="アクセスキー"
          className={`w-full rounded-lg border px-4 py-2.5 text-sm mb-3 ${
            error ? "border-red-400 bg-red-50" : "border-gray-300"
          }`}
        />
        {error && <p className="text-xs text-red-600 mb-3">キーが正しくありません</p>}
        <button
          onClick={handleSubmit}
          className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700"
        >
          入る
        </button>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthGate>
      <div className="min-h-screen bg-gray-50">
        <PhaseNav />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/companies" element={<Companies />} />
          <Route path="/candidate-prep" element={<CandidatePrep />} />
          <Route path="/meeting-assist" element={<MeetingAssist />} />
          <Route path="/follow-up" element={<FollowUp />} />
          <Route path="/industry" element={<IndustryMap />} />
          <Route path="/learning" element={<LearningHub />} />
          <Route path="/briefing" element={<Briefing />} />
          <Route path="/search" element={<SearchPanel />} />
          <Route path="/post-meeting" element={<PostMeeting />} />
        </Routes>
      </div>
    </AuthGate>
  );
}
