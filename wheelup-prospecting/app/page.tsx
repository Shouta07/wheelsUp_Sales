import Link from "next/link";

import { listCompanyOverview, listReady } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [companies, ready] = await Promise.all([
    listCompanyOverview(),
    listReady(20),
  ]);

  const totalCompanies = companies.length;
  const sCount = companies.filter((c) => c.priority === "S").length;
  const aCount = companies.filter((c) => c.priority === "A").length;
  const openJobs = companies.reduce((s, c) => s + (c.open_jobs ?? 0), 0);
  const strong = companies.reduce((s, c) => s + (c.strong_matches ?? 0), 0);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">ダッシュボード</h1>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="ターゲット企業" value={totalCompanies} />
        <Stat label="Sランク" value={sCount} />
        <Stat label="Aランク" value={aCount} />
        <Stat label="公開求人(open)" value={openJobs} />
        <Stat label="◎○マッチ" value={strong} />
      </section>

      <section className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">実行待ち（直近20件）</h2>
          <Link href="/ready" className="text-sm text-accent hover:underline">
            すべて見る →
          </Link>
        </div>
        {ready.length === 0 ? (
          <p className="text-sm text-mute">
            実行待ちはまだありません。 <code>POST /api/crawl</code> →{" "}
            <code>POST /api/match</code> で生成されます。
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {ready.map((r) => (
              <li key={r.match_id} className="flex items-center gap-3 py-2 text-sm">
                <span className={`w-6 text-center ${r.grade === "◎" ? "text-good" : ""}`}>
                  {r.grade}
                </span>
                <span className="w-12 text-mute">{r.score}</span>
                <Link href={`/companies/${r.company_id}`} className="w-48 truncate font-medium hover:underline">
                  {r.company_name}
                </Link>
                <span className="flex-1 truncate text-mute">{r.job_title}</span>
                <span className="w-20 text-right text-xs text-mute">{r.candidate_name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-mute">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}
