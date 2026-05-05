import { useGamification } from "../gamification/GamificationProvider";
import MeetingHub from "../components/gamification/MeetingHub";
import SkillRadar from "../components/gamification/SkillRadar";
import WeeklyReport from "../components/gamification/WeeklyReport";
import WeeklyChallenge from "../components/gamification/WeeklyChallenge";
import NotificationFeed from "../components/gamification/NotificationFeed";
import TeamHighlights from "../components/gamification/TeamHighlights";
import PlaybookPanel from "../components/gamification/PlaybookPanel";

export default function Home() {
  const { currentUser } = useGamification();

  return (
    <div className="min-h-screen bg-[#f7f7f7]">
      <div className="mx-auto max-w-6xl px-4 py-6">

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-black text-[#4b4b4b]">
            {currentUser ? `${currentUser}さん` : "ダッシュボード"}
          </h1>
          <p className="text-xs font-bold text-[#afafaf] mt-0.5">
            リーダーの面談と比較して、営業力を磨こう
          </p>
        </div>

        {/* Main 3-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_300px] gap-6">

          {/* LEFT — Skill & Progress */}
          <aside className="hidden lg:flex flex-col gap-5">
            <SkillRadar />
            <WeeklyReport />
            <WeeklyChallenge />
          </aside>

          {/* CENTER — Meeting comparison hub */}
          <main className="space-y-5">
            <MeetingHub />
            <PlaybookPanel />
          </main>

          {/* RIGHT — Feed & Team */}
          <aside className="space-y-5">
            <NotificationFeed />
            <TeamHighlights />
          </aside>
        </div>
      </div>
    </div>
  );
}
