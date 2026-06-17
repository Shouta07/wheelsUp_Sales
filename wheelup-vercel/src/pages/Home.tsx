import { useGamification } from "../gamification/GamificationProvider";
import { IS_DEMO_MODE } from "../api/client";
import { isLeader as isLeaderRole } from "../lib/team";
import MeetingHub from "../components/gamification/MeetingHub";
import MemberGrowthOverview from "../components/gamification/MemberGrowthOverview";
import ScoringModelPanel from "../components/gamification/ScoringModelPanel";
import SkillGapPanel from "../components/gamification/SkillGapPanel";

export default function Home() {
  const { currentUser } = useGamification();
  const isLeaderUser = isLeaderRole(currentUser);

  return (
    <div className="min-h-screen bg-[#f7f7f7]">
      <div className="mx-auto max-w-5xl px-4 py-6">

        {/* Header */}
        <div className="mb-4">
          <h1 className="text-xl font-black text-[#4b4b4b]">
            {currentUser ? `${currentUser}さん` : "面談フィードバック"}
          </h1>
          {isLeaderUser && (
            <p className="text-xs font-bold text-[#afafaf] mt-0.5">
              リーダー画面：教師データの登録とメンバーの成長確認
            </p>
          )}
        </div>

        {IS_DEMO_MODE && (
          <div className="mb-4 rounded-2xl border-2 border-[#fbbf24] bg-[#fffbeb] px-4 py-3">
            <p className="text-xs font-extrabold text-[#92400e]">⚠️ デモモード（Supabase 未設定）</p>
          </div>
        )}

        {isLeaderUser ? (
          /* ───── リーダー画面: シンプル構成 ─────
             自分の成長グラフ / 今日のミッション / リーダープレイブックは出さない。
             メンバーの成長 → 教師データ登録 (面談ライブラリ) → CVR の順。 */
          <>
            <ScoringModelPanel />
            <div className="mb-4">
              <MemberGrowthOverview />
            </div>
            <main>
              <MeetingHub />
            </main>
          </>
        ) : (
          /* ───── メンバー画面 ─────
             西村 FB: 今日のミッション / 成長グラフは不要。
             リーダーとのスキルギャップ + 課題改善の学習リンクを上部に置く。 */
          <>
            {currentUser && <SkillGapPanel currentUser={currentUser} />}

            <main>
              <MeetingHub />
            </main>
            {/* 統計・成長グラフ・チームハイライトは小林FBで撤去 */}
          </>
        )}
      </div>
    </div>
  );
}
