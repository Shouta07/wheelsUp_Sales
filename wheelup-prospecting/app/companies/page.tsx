import Link from "next/link";

import { listCompanyOverview } from "@/lib/queries";
import type { Priority } from "@/lib/types";

export const dynamic = "force-dynamic";

type SP = { q?: string; priority?: string; category?: string };

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const all = await listCompanyOverview();

  const q = (sp.q ?? "").trim().toLowerCase();
  const priorityFilter = (sp.priority ?? "").toUpperCase();
  const categoryFilter = sp.category ?? "";

  const filtered = all.filter((c) => {
    if (q && !c.name.toLowerCase().includes(q)) return false;
    if (priorityFilter && c.priority !== priorityFilter) return false;
    if (categoryFilter && c.category !== categoryFilter) return false;
    return true;
  });

  const categories = Array.from(new Set(all.map((c) => c.category).filter(Boolean))) as string[];

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <h1 className="text-xl font-semibold">企業一覧</h1>
        <span className="text-sm text-mute">
          {filtered.length} / {all.length} 件
        </span>
      </div>

      <form className="card flex flex-wrap gap-3 p-4 text-sm" action="/companies" method="GET">
        <label className="flex flex-col">
          <span className="text-xs text-mute">企業名で絞り込み</span>
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="例: シミズ"
            className="rounded border border-line px-2 py-1"
          />
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-mute">優先度</span>
          <select name="priority" defaultValue={sp.priority ?? ""} className="rounded border border-line px-2 py-1">
            <option value="">すべて</option>
            {(["S", "A", "B", "C"] as Priority[]).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-xs text-mute">カテゴリ</span>
          <select name="category" defaultValue={sp.category ?? ""} className="rounded border border-line px-2 py-1">
            <option value="">すべて</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button className="btn-primary" type="submit">絞り込む</button>
          <Link href="/companies" className="btn">リセット</Link>
        </div>
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-mute">
            <tr>
              <th className="px-3 py-2">優先度</th>
              <th className="px-3 py-2">カテゴリ</th>
              <th className="px-3 py-2">企業</th>
              <th className="px-3 py-2 text-right">公開求人</th>
              <th className="px-3 py-2 text-right">◎○マッチ</th>
              <th className="px-3 py-2">採用ページ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <td className="px-3 py-2 font-medium">{c.priority}</td>
                <td className="px-3 py-2 text-mute">{c.category ?? "-"}</td>
                <td className="px-3 py-2">
                  <Link href={`/companies/${c.id}`} className="hover:underline">{c.name}</Link>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{c.open_jobs}</td>
                <td className="px-3 py-2 text-right tabular-nums">{c.strong_matches}</td>
                <td className="max-w-xs truncate px-3 py-2 text-xs text-mute">
                  {c.recruit_page_url ? (
                    <a href={c.recruit_page_url} target="_blank" rel="noreferrer" className="hover:underline">
                      {c.recruit_page_url}
                    </a>
                  ) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
