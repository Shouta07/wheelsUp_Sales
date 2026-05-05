import { useGamification } from "../gamification/GamificationProvider";
import MeetingHub from "../components/gamification/MeetingHub";
import SkillRadar from "../components/gamification/SkillRadar";
import NotificationFeed from "../components/gamification/NotificationFeed";
import WeeklyChallenge from "../components/gamification/WeeklyChallenge";
import WeeklyReport from "../components/gamification/WeeklyReport";

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

        {/* 2-column: Meetings (main) + Gamification (side) */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">

          {/* MAIN — Meeting feedback */}
          <main className="space-y-5">
            <MeetingHub />
          </main>

          {/* SIDE — Score results + gamification */}
          <aside className="space-y-5">
            <NotificationFeed />
            <SkillRadar />
            <WeeklyChallenge />
            <WeeklyReport />
          </aside>
        </div>
      </div>
    </div>
  );
}
