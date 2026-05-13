import { useEffect, useState } from "react";
import { getCompanyDetail } from "../../lib/ra/queries";
import type { Activity, Company, CompanyOverview, Job, ReadyRow } from "../../lib/ra/types";

type Detail = {
  overview: CompanyOverview | null;
  contact_paths: Company["contact_paths"];
  notes: string | null;
  jobs: Job[];
  matches: ReadyRow[];
  activities: Activity[];
};

export default function ProspectingCompanyDetail({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getCompanyDetail(id).then((d) => { if (alive) setDetail(d as Detail | null); }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id]);

  if (loading) return <div className="text-sm text-gray-500">読み込み中…</div>;
  if (!detail || !detail.overview) {
    return (
      <div>
        <button onClick={onBack} className="text-xs font-bold text-[#afafaf] hover:underline">← 企業一覧へ</button>
        <p className="mt-3 text-sm text-gray-500">企業が見つかりません。</p>
      </div>
    );
  }

  const { overview, contact_paths, notes, jobs, matches, activities } = detail;

  return (
    <div className="space-y-5">
      <div>
        <button onClick={onBack} className="text-xs font-bold text-[#afafaf] hover:underline">← 企業一覧へ</button>
        <h2 className="mt-2 text-xl font-black text-[#4b4b4b]">{overview.name}</h2>
        <div className="mt-1 flex gap-1.5 flex-wrap text-[10px] font-bold">
          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[#4b4b4b]">優先度 {overview.priority}</span>
          {overview.category && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[#4b4b4b]">{overview.category}</span>}
          {overview.last_crawled_at && (
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[#afafaf]">
              最終クロール {new Date(overview.last_crawled_at).toLocaleString("ja-JP")}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card title="連絡経路">
          {contact_paths.length === 0 ? (
            <p className="text-xs text-gray-500">未登録</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {contact_paths.map((p, i) => (
                <li key={i}>
                  <span className="mr-2 px-1.5 py-0.5 rounded bg-gray-100 text-[10px]">{p.kind}</span>
                  {p.url ? <a className="hover:underline" href={p.url} target="_blank" rel="noreferrer">{p.url}</a> : p.value}
                </li>
              ))}
            </ul>
          )}
          {overview.recruit_page_url && (
            <p className="mt-2 text-[10px] text-gray-500">
              採用ページ:{" "}
              <a href={overview.recruit_page_url} target="_blank" rel="noreferrer" className="hover:underline">
                {overview.recruit_page_url}
              </a>
            </p>
          )}
          {notes && <p className="mt-2 text-[10px] text-gray-500">{notes}</p>}
        </Card>

        <Card title="公開求人">
          {jobs.length === 0 ? (
            <p className="text-xs text-gray-500">未取得</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {jobs.map((j) => (
                <li key={j.id} className="flex items-center gap-2">
                  <span className={`text-[10px] font-black ${j.is_open ? "text-green-600" : "text-gray-400"}`}>
                    {j.is_open ? "OPEN" : "CLOSED"}
                  </span>
                  <span className="flex-1 truncate">{j.title}</span>
                  {j.url && (
                    <a href={j.url} target="_blank" rel="noreferrer" className="text-[10px] text-gray-400 hover:underline">link</a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="マッチ判定（◎ ○ △ ×）">
        {matches.length === 0 ? (
          <p className="text-xs text-gray-500">未判定</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-left text-[10px] uppercase text-gray-500">
              <tr><th>判定</th><th>点数</th><th>求人</th><th>候補者</th><th>理由</th></tr>
            </thead>
            <tbody>
              {matches.map((m) => (
                <tr key={m.match_id} className="border-t border-gray-100">
                  <td className={`py-1 font-black ${m.grade === "◎" ? "text-green-600" : "text-blue-500"}`}>{m.grade}</td>
                  <td className="py-1 tabular-nums">{m.score}</td>
                  <td className="py-1">{m.job_title}</td>
                  <td className="py-1 text-gray-500">{m.candidate_name}</td>
                  <td className="py-1 text-[10px] text-gray-500">{(m.reasons ?? []).slice(0, 2).join(" / ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title="活動履歴">
        {activities.length === 0 ? (
          <p className="text-xs text-gray-500">未記録</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-xs">
            {activities.map((a) => (
              <li key={a.id} className="py-2">
                <span className="mr-2 px-1.5 py-0.5 rounded bg-gray-100 text-[10px]">{a.kind}</span>
                {a.channel && <span className="text-[10px] text-gray-400">{a.channel}</span>}
                <span className="ml-2 text-gray-400 text-[10px]">{new Date(a.occurred_at).toLocaleString("ja-JP")}</span>
                {a.body && <div className="mt-1 text-[10px] text-gray-500">{a.body}</div>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
      <h3 className="text-sm font-black text-[#4b4b4b] mb-2">{title}</h3>
      {children}
    </div>
  );
}
