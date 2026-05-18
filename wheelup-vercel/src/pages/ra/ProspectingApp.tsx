import { useState } from "react";
import ProspectingHome from "./ProspectingHome";
import ProspectingCompanyDetail from "./ProspectingCompanyDetail";
import ProspectingDiscovery from "./ProspectingDiscovery";
import ProspectingCandidates from "./ProspectingCandidates";
import ProspectingJobs from "./ProspectingJobs";
import RunToolbar from "./RunToolbar";
import HowToPanel from "./HowToPanel";
import { isLive } from "../../lib/ra/queries";

/**
 * RA 開拓 — タブを廃止して 1 画面に統合 (5/19 ユーザー要望)。
 *
 * - 通常は Home (進捗 / フォロー / 今日のアタック / 企業一覧) だけが見える
 * - 候補者 / 募集ポジション / 新規発掘 は <details> で折りたたみ (開けば一覧)
 * - 企業名クリックで CompanyDetail に切替 (戻るボタンあり)
 */
export default function ProspectingApp() {
  const [openCompanyId, setOpenCompanyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  return (
    <div className="min-h-screen bg-[#f7f7f7]">
      <div className="mx-auto max-w-5xl px-4 py-6">
        {/* DEPLOY-CHECK 2026-05-18 15:30 — もしこの赤帯が見えなければ Vercel デプロイ失敗 */}
        <div className="mb-3 rounded-md bg-red-600 text-white text-xs font-bold px-3 py-1.5 text-center">
          🚧 DEPLOY-CHECK 2026-05-18 — この赤帯が見えればデプロイ成功 / 見えなければ Vercel ダッシュボードを要確認
        </div>
        <header className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-black text-[#4b4b4b]">RA 新規開拓</h1>
            <p className="text-xs font-bold text-[#afafaf] mt-0.5">
              建築設備 / FM / PM / 施設管理 / ゼネコン の 246 社 × 4 候補者
            </p>
          </div>
          <span
            className={`text-[10px] font-bold px-2 py-1 rounded-full ${
              isLive ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
            }`}
          >
            {isLive ? "LIVE" : "MOCK"}
          </span>
        </header>

        <HowToPanel />
        <RunToolbar onDone={reload} />

        {openCompanyId ? (
          <ProspectingCompanyDetail
            id={openCompanyId}
            onBack={() => setOpenCompanyId(null)}
          />
        ) : (
          <div key={reloadKey} className="space-y-4">
            <ProspectingHome onOpenCompany={setOpenCompanyId} />

            <details className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <summary className="px-3 py-2 cursor-pointer text-xs font-black text-[#4b4b4b] bg-gray-50 rounded-t-xl">
                📋 募集ポジション一覧 (クリックで展開)
              </summary>
              <div className="p-3">
                <ProspectingJobs onOpenCompany={setOpenCompanyId} />
              </div>
            </details>

            <details className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <summary className="px-3 py-2 cursor-pointer text-xs font-black text-[#4b4b4b] bg-gray-50 rounded-t-xl">
                👥 候補者一覧 (クリックで展開)
              </summary>
              <div className="p-3">
                <ProspectingCandidates />
              </div>
            </details>

            <details className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <summary className="px-3 py-2 cursor-pointer text-xs font-black text-[#4b4b4b] bg-gray-50 rounded-t-xl">
                🔍 新規発掘 (Gemini 提案企業, クリックで展開)
              </summary>
              <div className="p-3">
                <ProspectingDiscovery />
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
