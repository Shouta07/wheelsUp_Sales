import { useState } from "react";
import ProspectingHome from "./ProspectingHome";
import ProspectingCompanyDetail from "./ProspectingCompanyDetail";
import ProspectingDiscovery from "./ProspectingDiscovery";
import ProspectingCandidates from "./ProspectingCandidates";
import ProspectingJobs from "./ProspectingJobs";
import RunToolbar from "./RunToolbar";
import HowToPanel from "./HowToPanel";
import RaErrorBoundary from "./RaErrorBoundary";
import { isLive } from "../../lib/ra/queries";

type Tab = "home" | "jobs" | "candidates" | "discovery";

/**
 * RA 開拓 — トップに 4 タブを配置 (5/20 ユーザー要望)。
 *  - ホーム: 進捗 / フォロー / 今日のアタック / 企業一覧
 *  - 募集ポジション: ProspectingJobs
 *  - 候補者一覧: ProspectingCandidates
 *  - 新規発掘: ProspectingDiscovery
 * 企業名クリックで CompanyDetail に切替 (戻るで該当タブに戻る)。
 */
export default function ProspectingApp() {
  const [tab, setTab] = useState<Tab>("home");
  const [openCompanyId, setOpenCompanyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  const tabs: { key: Tab; label: string; emoji: string }[] = [
    { key: "home", label: "ホーム", emoji: "🏠" },
    { key: "jobs", label: "募集ポジション", emoji: "📋" },
    { key: "candidates", label: "候補者一覧", emoji: "👥" },
    { key: "discovery", label: "新規発掘", emoji: "🔍" },
  ];

  return (
    <div className="min-h-screen bg-[#f7f7f7]">
      <div className="mx-auto max-w-5xl px-4 py-6">
        {/* Header */}
        <header className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-black text-[#4b4b4b]">RA 新規開拓</h1>
            <p className="text-xs font-bold text-[#afafaf] mt-0.5">
              建築設備 / FM / PM / 施設管理 / ゼネコン
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

        {/* タブ切替 */}
        {!openCompanyId && (
          <div className="mb-4 flex gap-1 border-b-2 border-gray-200 overflow-x-auto">
            {tabs.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`shrink-0 px-4 py-2 text-sm font-extrabold rounded-t-lg transition-colors ${
                    active
                      ? "bg-white border-2 border-b-0 border-gray-200 text-duo-blue -mb-0.5"
                      : "text-[#777] hover:text-[#4b4b4b]"
                  }`}
                >
                  <span className="mr-1">{t.emoji}</span>
                  {t.label}
                </button>
              );
            })}
          </div>
        )}

        {/* 企業詳細を開いてる時は他を隠す。全体をエラーバウンダリで保護 */}
        <RaErrorBoundary>
        {openCompanyId ? (
          <ProspectingCompanyDetail
            id={openCompanyId}
            onBack={() => setOpenCompanyId(null)}
          />
        ) : (
          <div key={reloadKey} className="space-y-4">
            {/* ホームタブだけ RunToolbar と HowToPanel を表示 */}
            {tab === "home" && (
              <>
                <HowToPanel />
                <RunToolbar onDone={reload} />
                <ProspectingHome onOpenCompany={setOpenCompanyId} />
              </>
            )}

            {tab === "jobs" && (
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
                <ProspectingJobs onOpenCompany={setOpenCompanyId} />
              </div>
            )}

            {tab === "candidates" && (
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
                <ProspectingCandidates />
              </div>
            )}

            {tab === "discovery" && (
              <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
                <ProspectingDiscovery />
              </div>
            )}
          </div>
        )}
        </RaErrorBoundary>
      </div>
    </div>
  );
}
