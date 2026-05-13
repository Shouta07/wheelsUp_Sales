import Link from "next/link";
import { getCompanyOverviews, getReady, getRecentActivities, isMock } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [overviews, ready, recent] = await Promise.all([
    getCompanyOverviews(),
    getReady(20),
    getRecentActivities(20),
  ]);

  const totalCompanies = overviews.length;
  const highPriority = overviews.filter((c) => c.priority >= 4).length;
  const openJobs = overviews.reduce((s, c) => s + (c.open_jobs ?? 0), 0);
  const goodMatches = overviews.reduce((s, c) => s + (c.good_matches ?? 0), 0);

  return (
    <div className="space-y-6">
      {isMock && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded p-3">
          モックモードで実行中（SUPABASE_URL 未設定）。/companies に246社が表示されます。
        </div>
      )}

      <h1 className="text-2xl font-semibold">概況</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="登録企業" value={totalCompanies} />
        <Stat label="優先度4以上" value={highPriority} />
        <Stat label="現在オープン求人" value={openJobs} />
        <Stat label="◎◯マッチ" value={goodMatches} />
      </div>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold">実行待ち（直近20件）</h2>
          <Link href="/ready" className="text-sm text-brand-600 hover:underline">全件を見る →</Link>
        </div>
        {ready.length === 0 ? (
          <p className="text-sm text-gray-500 bg-white border border-gray-200 rounded p-4">
            実行待ちはありません。{isMock ? "（モックモード）" : "/api/cron を実行してください。"}
          </p>
        ) : (
          <div className="bg-white border border-gray-200 rounded overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-3 py-2">ランク</th>
                  <th className="px-3 py-2">企業</th>
                  <th className="px-3 py-2">求人</th>
                  <th className="px-3 py-2">候補者</th>
                  <th className="px-3 py-2">スコア</th>
                </tr>
              </thead>
              <tbody>
                {ready.map((r) => (
                  <tr key={r.match_id} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-semibold">{r.match_rank}</td>
                    <td className="px-3 py-2">
                      <Link href={`/companies/${r.company_id}`} className="text-brand-600 hover:underline">
                        {r.company_name}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{r.job_title}</td>
                    <td className="px-3 py-2">{r.candidate_name}</td>
                    <td className="px-3 py-2">{r.match_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">最近の活動</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-500 bg-white border border-gray-200 rounded p-4">活動ログはまだありません。</p>
        ) : (
          <ul className="bg-white border border-gray-200 rounded divide-y divide-gray-100">
            {recent.map((a) => (
              <li key={a.id} className="px-3 py-2 text-sm flex items-center gap-3">
                <span className="text-gray-400 text-xs w-32">{new Date(a.occurred_at).toLocaleString("ja-JP")}</span>
                <span className="font-medium">{a.kind}</span>
                <span className="text-gray-600 truncate">{a.body}</span>
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
    <div className="bg-white border border-gray-200 rounded p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
