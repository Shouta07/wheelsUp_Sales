import Link from "next/link";
import { notFound } from "next/navigation";

import { getCompanyDetail } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getCompanyDetail(id);
  if (!detail) notFound();
  const { overview, contact_paths, notes, jobs, matches, activities } = detail;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/companies" className="text-sm text-mute hover:underline">← 企業一覧</Link>
        <h1 className="mt-2 text-2xl font-semibold">{overview.name}</h1>
        <div className="mt-1 flex gap-2 text-sm">
          <span className="chip">優先度 {overview.priority}</span>
          {overview.category && <span className="chip">{overview.category}</span>}
          {overview.last_crawled_at && (
            <span className="chip">最終クロール {new Date(overview.last_crawled_at).toLocaleString("ja-JP")}</span>
          )}
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="card p-4">
          <h2 className="mb-2 font-semibold">連絡経路</h2>
          {contact_paths.length === 0 ? (
            <p className="text-sm text-mute">未登録</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {contact_paths.map((p, i) => (
                <li key={i}>
                  <span className="chip mr-2">{p.kind}</span>
                  {p.url ? (
                    <a href={p.url} target="_blank" rel="noreferrer" className="hover:underline">{p.url}</a>
                  ) : (
                    p.value
                  )}
                  {p.note && <span className="ml-2 text-mute">— {p.note}</span>}
                </li>
              ))}
            </ul>
          )}
          {overview.recruit_page_url && (
            <p className="mt-2 text-xs text-mute">
              採用ページ:{" "}
              <a href={overview.recruit_page_url} target="_blank" rel="noreferrer" className="hover:underline">
                {overview.recruit_page_url}
              </a>
            </p>
          )}
          {notes && <p className="mt-2 text-xs text-mute">{notes}</p>}
        </div>

        <div className="card p-4">
          <h2 className="mb-2 font-semibold">公開求人</h2>
          {jobs.length === 0 ? (
            <p className="text-sm text-mute">未取得</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {jobs.map((j) => (
                <li key={j.id} className="flex items-center gap-2">
                  <span className={j.is_open ? "text-good" : "text-mute"}>{j.is_open ? "OPEN" : "CLOSED"}</span>
                  <span className="flex-1 truncate">{j.title}</span>
                  {j.url && (
                    <a href={j.url} target="_blank" rel="noreferrer" className="text-xs text-mute hover:underline">
                      link
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">マッチ判定（◎○△×）</h2>
        {matches.length === 0 ? (
          <p className="text-sm text-mute">未判定</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-mute">
              <tr><th>判定</th><th>点数</th><th>求人</th><th>候補者</th><th>理由</th></tr>
            </thead>
            <tbody>
              {matches.map((m) => (
                <tr key={m.match_id} className="border-t border-line">
                  <td className="py-1 font-semibold">{m.grade}</td>
                  <td className="py-1">{m.score}</td>
                  <td className="py-1">{m.job_title}</td>
                  <td className="py-1">{m.candidate_name}</td>
                  <td className="py-1 text-xs text-mute">{(m.reasons ?? []).slice(0, 2).join(" / ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">活動履歴</h2>
        {activities.length === 0 ? (
          <p className="text-sm text-mute">未記録</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {activities.map((a) => (
              <li key={a.id} className="py-2">
                <span className="chip mr-2">{a.kind}</span>
                {a.channel && <span className="text-xs text-mute">{a.channel}</span>}
                <span className="ml-2 text-mute">{new Date(a.occurred_at).toLocaleString("ja-JP")}</span>
                {a.body && <div className="mt-1 text-xs text-mute">{a.body}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
