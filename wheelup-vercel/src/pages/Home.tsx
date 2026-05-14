import { useGamification } from "../gamification/GamificationProvider";
import { IS_DEMO_MODE } from "../api/client";
import MeetingHub from "../components/gamification/MeetingHub";
import SkillRadar from "../components/gamification/SkillRadar";
import NotificationFeed from "../components/gamification/NotificationFeed";
import WeeklyChallenge from "../components/gamification/WeeklyChallenge";
import WeeklyReport from "../components/gamification/WeeklyReport";
import TeamHighlights from "../components/gamification/TeamHighlights";
import PlaybookPanel from "../components/gamification/PlaybookPanel";

export default function Home() {
  const { currentUser } = useGamification();

  return (
    <div className="min-h-screen bg-[#f7f7f7]">
      <div className="mx-auto max-w-5xl px-4 py-6">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-black text-[#4b4b4b]">
            {currentUser ? `${currentUser}さん` : "面談フィードバック"}
          </h1>
          <p className="text-xs font-bold text-[#afafaf] mt-0.5">
            面談を入れるだけ。AIが自動で採点して、リーダーと比較します
          </p>
        </div>

        {IS_DEMO_MODE && (
          <div className="mb-4 rounded-2xl border-2 border-[#fbbf24] bg-[#fffbeb] px-4 py-3">
            <p className="text-xs font-extrabold text-[#92400e]">
              ⚠️ デモモード（VITE_SUPABASE_URL 未設定）
            </p>
            <p className="text-[11px] font-bold text-[#92400e] mt-0.5 leading-snug">
              保存・採点はブラウザ内のみで永続化されません。本番運用には Vercel の環境変数に
              VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY、サーバ側に SUPABASE_URL /
              SUPABASE_SERVICE_ROLE_KEY / GEMINI_API_KEY を設定してください。
            </p>
          </div>
        )}

        {/* 2-column: Meetings (main) + Gamification (side) */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">

          {/* MAIN — Meeting feedback + Playbook */}
          <main className="space-y-5">
            <MeetingHub />
            <PlaybookPanel />
          </main>

          {/* SIDE — Score results + gamification */}
          <aside className="space-y-5">
            <NotificationFeed />
            <SkillRadar />
            <WeeklyChallenge />
            <WeeklyReport />
            <TeamHighlights />
          </aside>
        </div>
      </div>
    </div>
  );
}
