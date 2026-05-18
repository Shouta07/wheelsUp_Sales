import { useState } from "react";
import { useGamification } from "../gamification/GamificationProvider";
import { IS_DEMO_MODE } from "../api/client";
import MeetingHub from "../components/gamification/MeetingHub";
import SkillRadar from "../components/gamification/SkillRadar";
import NotificationFeed from "../components/gamification/NotificationFeed";
import WeeklyChallenge from "../components/gamification/WeeklyChallenge";
import WeeklyReport from "../components/gamification/WeeklyReport";
import TeamHighlights from "../components/gamification/TeamHighlights";
import PlaybookPanel from "../components/gamification/PlaybookPanel";
import TodayMission from "../components/gamification/TodayMission";

export default function Home() {
  const { currentUser } = useGamification();
  const [showStats, setShowStats] = useState(false);

  return (
    <div className="min-h-screen bg-[#f7f7f7]">
      <div className="mx-auto max-w-5xl px-4 py-6">

        {/* Header */}
        <div className="mb-4">
          <h1 className="text-xl font-black text-[#4b4b4b]">
            {currentUser ? `${currentUser}さん` : "面談フィードバック"}
          </h1>
        </div>

        {IS_DEMO_MODE && (
          <div className="mb-4 rounded-2xl border-2 border-[#fbbf24] bg-[#fffbeb] px-4 py-3">
            <p className="text-xs font-extrabold text-[#92400e]">⚠️ デモモード（Supabase 未設定）</p>
          </div>
        )}

        {/* 今日のミッション (ユーザーの次にやるべきことを明示) */}
        {currentUser && <TodayMission currentUser={currentUser} />}

        {/* MAIN: 面談ライブラリ + プレイブック */}
        <main className="space-y-5">
          <MeetingHub />
          <PlaybookPanel />
        </main>

        {/* 統計・ゲーミフィケーション (折りたたみ式) */}
        <div className="mt-5">
          <button
            onClick={() => setShowStats(!showStats)}
            className="w-full text-left rounded-2xl bg-white border-2 border-[#e5e5e5] hover:border-duo-blue px-4 py-3 flex items-center justify-between transition-colors"
          >
            <span className="text-sm font-extrabold text-[#4b4b4b]">📊 統計・成長グラフ・チームハイライト</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#afafaf" className={`transition-transform ${showStats ? "rotate-180" : ""}`}>
              <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
            </svg>
          </button>
          {showStats && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
              <NotificationFeed />
              <SkillRadar />
              <WeeklyChallenge />
              <WeeklyReport />
              <TeamHighlights />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
