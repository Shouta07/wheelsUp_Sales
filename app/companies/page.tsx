import Link from "next/link";
import { getCompanyOverviews } from "@/lib/queries";

export const dynamic = "force-dynamic";

interface SP {
  q?: string;
  category?: string;
  priority?: string;
}

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const all = await getCompanyOverviews();

  const categories = Array.from(new Set(all.map((c) => c.category).filter(Boolean))) as string[];

  const q = (sp.q ?? "").trim();
  const category = sp.category ?? "";
  const priority = sp.priority ?? "";

  const filtered = all.filter((c) => {
    if (q && !c.name.includes(q)) return false;
    if (category && c.category !== category) return false;
    if (priority && String(c.priority) !== priority) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">企業</h1>
        <span className="text-sm text-gray-500">{filtered.length} / {all.length} 社</span>
      </div>

      <form className="bg-white border border-gray-200 rounded p-3 flex flex-wrap gap-3 text-sm">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="社名で検索"
          className="border border-gray-200 rounded px-2 py-1 w-56"
        />
        <select name="category" defaultValue={category} className="border border-gray-200 rounded px-2 py-1">
          <option value="">全カテゴリ</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select name="priority" defaultValue={priority} className="border border-gray-200 rounded px-2 py-1">
          <option value="">全優先度</option>
          {[5,4,3,2,1].map((p) => (
            <option key={p} value={p}>優先度 {p}</option>
          ))}
        </select>
        <button className="bg-brand-600 text-white px-3 py-1 rounded">適用</button>
        <Link href="/companies" className="text-gray-500 px-2 py-1">クリア</Link>
      </form>

      <div className="bg-white border border-gray-200 rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-3 py-2">優先度</th>
              <th className="px-3 py-2">企業名</th>
              <th className="px-3 py-2">カテゴリ</th>
              <th className="px-3 py-2">オープン求人</th>
              <th className="px-3 py-2">◎○マッチ</th>
              <th className="px-3 py-2">採用ページ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-t border-gray-100">
                <td className="px-3 py-2">{c.priority}</td>
                <td className="px-3 py-2">
                  <Link href={`/companies/${c.id}`} className="text-brand-600 hover:underline">{c.name}</Link>
                </td>
                <td className="px-3 py-2 text-gray-500">{c.category ?? "-"}</td>
                <td className="px-3 py-2">{c.open_jobs ?? 0}</td>
                <td className="px-3 py-2">{c.good_matches ?? 0}</td>
                <td className="px-3 py-2 text-xs">
                  {c.recruit_page_url ? (
                    <a href={c.recruit_page_url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                      開く
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
