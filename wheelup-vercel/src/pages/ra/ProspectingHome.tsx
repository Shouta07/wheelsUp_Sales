import { useEffect, useState } from "react";
import { listCompanyOverview, listReady } from "../../lib/ra/queries";
import type { CompanyOverview, ReadyRow } from "../../lib/ra/types";

export default function ProspectingHome({
  onOpenCompany,
}: {
  onOpenCompany: (id: string) => void;
}) {
  const [companies, setCompanies] = useState<CompanyOverview[]>([]);
  const [ready, setReady] = useState<ReadyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [co, rd] = await Promise.all([listCompanyOverview(), listReady(20)]);
        if (!alive) return;
        setCompanies(co);
        setReady(rd);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="text-sm text-gray-500">読み込み中…</div>;

  const total = companies.length;
  const s = companies.filter((c) => c.priority === "S").length;
  const a = companies.filter((c) => c.priority === "A").length;
  const openJobs = companies.reduce((acc, c) => acc + (c.open_jobs ?? 0), 0);
  const strong = companies.reduce((acc, c) => acc + (c.strong_matches ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="ターゲット企業" value={total} />
        <Stat label="S ランク" value={s} />
        <Stat label="A ランク" value={a} />
        <Stat label="公開求人" value={openJobs} />
        <Stat label="◎○ マッチ" value={strong} accent />
      </div>

      <div className="rounded-xl bg-white border border-gray-200 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-black text-[#4b4b4b]">実行待ち（直近 20 件）</h2>
          <span className="text-[10px] font-bold text-[#afafaf]">{ready.length}件</span>
        </div>
        {ready.length === 0 ? (
          <p className="text-xs text-gray-500">
            まだありません。<code>POST /api/ra/crawl</code> → <code>POST /api/ra/match</code> を回すと、ここに ◎○ が並びます。
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {ready.map((r) => (
              <li key={r.match_id} className="py-2 flex items-center gap-2 text-xs">
                <span className={`w-5 text-center font-black ${r.grade === "◎" ? "text-green-600" : "text-blue-500"}`}>
                  {r.grade}
                </span>
                <span className="w-10 tabular-nums text-gray-500">{r.score}</span>
                <button
                  onClick={() => onOpenCompany(r.company_id)}
                  className="w-44 truncate text-left font-bold text-[#4b4b4b] hover:underline"
                >
                  {r.company_name}
                </button>
                <span className="flex-1 truncate text-gray-500">{r.job_title}</span>
                <span className="w-16 text-right text-[10px] text-gray-400">{r.candidate_name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-3 ${accent ? "ring-2 ring-[#58CC02]/30" : ""}`}>
      <div className="text-[10px] font-bold text-[#afafaf] uppercase">{label}</div>
      <div className="mt-0.5 text-2xl font-black tabular-nums text-[#4b4b4b]">{value}</div>
    </div>
  );
}
