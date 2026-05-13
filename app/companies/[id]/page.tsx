import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getActivitiesForCompany,
  getCompany,
  getJobsForCompany,
  getMatchesForCompany,
  isMock,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const company = await getCompany(id);
  if (!company) notFound();

  const [jobs, matches, activities] = await Promise.all([
    getJobsForCompany(id),
    getMatchesForCompany(id),
    getActivitiesForCompany(id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/companies" className="text-sm text-brand-600 hover:underline">← 企業一覧</Link>
      </div>

      <header className="bg-white border border-gray-200 rounded p-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{company.name}</h1>
          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{company.category ?? "-"}</span>
          <span className="text-xs">優先度 {company.priority}</span>
        </div>
        <dl className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
          <Detail label="HP" value={company.homepage_url} link />
          <Detail label="採用ページ" value={company.recruit_page_url} link />
          <Detail label="問合せフォーム" value={company.inquiry_form_url} link />
          <Detail label="電話" value={company.phone} />
          <Detail label="住所" value={company.address} />
          <Detail label="従業員規模" value={company.employees_range} />
          <Detail label="設立" value={company.established_year ? String(company.established_year) : null} />
          <Detail label="人事担当" value={company.hr_contact_name} />
          <Detail label="人事Email" value={company.hr_contact_email} />
        </dl>
      </header>

      <section>
        <h2 className="text-lg font-semibold mb-2">求人</h2>
        {isMock ? (
          <p className="text-sm text-gray-500 bg-white border border-gray-200 rounded p-4">
            モックモードでは求人情報は表示されません。
          </p>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-gray-500 bg-white border border-gray-200 rounded p-4">求人なし。/api/crawl を実行してください。</p>
        ) : (
          <ul className="bg-white border border-gray-200 rounded divide-y divide-gray-100">
            {jobs.map((j) => (
              <li key={j.id} className="p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className={j.is_open ? "text-green-700" : "text-gray-400"}>●</span>
                  <span className="font-medium">{j.title}</span>
                  <span className="text-xs text-gray-500">{j.employment_type ?? ""}</span>
                  <span className="text-xs text-gray-500">{j.location ?? ""}</span>
                  {j.url && (
                    <a href={j.url} target="_blank" rel="noreferrer" className="ml-auto text-xs text-brand-600 hover:underline">
                      原文
                    </a>
                  )}
                </div>
                {j.description && <p className="mt-1 text-gray-600 line-clamp-3">{j.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">マッチ判定</h2>
        {matches.length === 0 ? (
          <p className="text-sm text-gray-500 bg-white border border-gray-200 rounded p-4">マッチ未評価。</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-3 py-2">ランク</th>
                  <th className="px-3 py-2">スコア</th>
                  <th className="px-3 py-2">候補者</th>
                  <th className="px-3 py-2">求人</th>
                  <th className="px-3 py-2">理由</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => (
                  <tr key={m.id} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2 font-semibold">{m.rank}</td>
                    <td className="px-3 py-2">{m.score}</td>
                    <td className="px-3 py-2">{m.candidate_name ?? m.candidate_id}</td>
                    <td className="px-3 py-2">{m.job_title ?? m.job_id}</td>
                    <td className="px-3 py-2 text-gray-600">{m.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">活動履歴</h2>
        {activities.length === 0 ? (
          <p className="text-sm text-gray-500 bg-white border border-gray-200 rounded p-4">活動ログなし。</p>
        ) : (
          <ul className="bg-white border border-gray-200 rounded divide-y divide-gray-100">
            {activities.map((a) => (
              <li key={a.id} className="px-3 py-2 text-sm flex items-start gap-3">
                <span className="text-gray-400 text-xs w-32">{new Date(a.occurred_at).toLocaleString("ja-JP")}</span>
                <span className="font-medium">{a.kind}</span>
                <span className="text-gray-500">{a.channel}</span>
                <span className="text-gray-700">{a.body}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Detail({ label, value, link }: { label: string; value?: string | null; link?: boolean }) {
  return (
    <>
      <dt className="text-gray-500">{label}</dt>
      <dd className="md:col-span-2 truncate">
        {value ? (
          link ? (
            <a href={value} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          <span className="text-gray-300">-</span>
        )}
      </dd>
    </>
  );
}
