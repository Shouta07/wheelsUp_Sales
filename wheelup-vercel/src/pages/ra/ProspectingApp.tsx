import { useState } from "react";
import ProspectingHome from "./ProspectingHome";
import ProspectingReady from "./ProspectingReady";
import ProspectingCompanies from "./ProspectingCompanies";
import ProspectingCompanyDetail from "./ProspectingCompanyDetail";
import ProspectingDiscovery from "./ProspectingDiscovery";
import ProspectingCandidates from "./ProspectingCandidates";
import ProspectingJobs from "./ProspectingJobs";
import RunToolbar from "./RunToolbar";
import { isLive } from "../../lib/ra/queries";

type View =
  | { name: "home" }
  | { name: "ready" }
  | { name: "jobs" }
  | { name: "companies" }
  | { name: "company"; id: string }
  | { name: "candidates" }
  | { name: "discovery" };

const TABS: { key: View["name"]; label: string }[] = [
  { key: "home",       label: "ダッシュボード" },
  { key: "ready",      label: "実行待ち" },
  { key: "jobs",       label: "募集ポジション" },
  { key: "companies",  label: "企業一覧" },
  { key: "candidates", label: "候補者" },
  { key: "discovery",  label: "新規発掘" },
];

export default function ProspectingApp() {
  const [view, setView] = useState<View>({ name: "home" });
  const [reloadKey, setReloadKey] = useState(0);
  const openCompany = (id: string) => setView({ name: "company", id });
  const reload = () => setReloadKey((k) => k + 1);

  return (
    <div className="min-h-screen bg-[#f7f7f7]">
      <div className="mx-auto max-w-5xl px-4 py-6">
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

        <nav className="mb-3 flex flex-wrap gap-1.5">
          {TABS.map((t) => {
            const active = view.name === t.key || (t.key === "companies" && view.name === "company");
            return (
              <button
                key={t.key}
                onClick={() => setView({ name: t.key } as View)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  active
                    ? "bg-[#1CB0F6] text-white"
                    : "bg-white text-[#4b4b4b] border border-[#e5e5e5] hover:bg-gray-50"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </nav>

        <RunToolbar onDone={reload} />

        <div key={reloadKey}>
          {view.name === "home"       && <ProspectingHome onOpenCompany={openCompany} />}
          {view.name === "ready"      && <ProspectingReady onOpenCompany={openCompany} />}
          {view.name === "jobs"       && <ProspectingJobs onOpenCompany={openCompany} />}
          {view.name === "companies"  && <ProspectingCompanies onOpenCompany={openCompany} />}
          {view.name === "company"    && (
            <ProspectingCompanyDetail id={view.id} onBack={() => setView({ name: "companies" })} />
          )}
          {view.name === "candidates" && <ProspectingCandidates />}
          {view.name === "discovery"  && <ProspectingDiscovery />}
        </div>
      </div>
    </div>
  );
}
