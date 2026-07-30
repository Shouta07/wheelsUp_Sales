import { useGamification } from "../gamification/GamificationProvider";
import { IS_DEMO_MODE } from "../api/client";
import MeetingHub from "../components/gamification/MeetingHub";

/**
 * 面談フィードバック画面。
 * 西村 FB 2026-07-18 のピボットで、AI採点まわりのパネル（採点モデル/スキルギャップ/
 * メンバーの成長）は撤去。全員が同じ画面でメンバータブを切り替える構成に統一した。
 */
export default function Home() {
  const { currentUser } = useGamification();

  return (
    <div className="min-h-screen bg-[#f7f7f7]">
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4">
          <h1 className="text-xl font-black text-[#4b4b4b]">
            {currentUser ? `${currentUser}さん` : "面談フィードバック"}
          </h1>
          <p className="text-xs font-bold text-[#afafaf] mt-0.5">
            メンバーを切り替えて、トーク傾向の確認とフィードバックの入力ができます
          </p>
        </div>

        {IS_DEMO_MODE && (
          <div className="mb-4 rounded-2xl border-2 border-[#fbbf24] bg-[#fffbeb] px-4 py-3">
            <p className="text-xs font-extrabold text-[#92400e]">⚠️ デモモード（Supabase 未設定）</p>
          </div>
        )}

        <main>
          <MeetingHub />
        </main>
      </div>
    </div>
  );
}
