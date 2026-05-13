import { useEffect, useMemo, useState } from "react";
import { listCompanyOverview } from "../../lib/ra/queries";
import type { CompanyOverview, Priority } from "../../lib/ra/types";

export default function ProspectingCompanies({
  onOpenCompany,
}: {
  onOpenCompany: (id: string) => void;
}) {
  const [all, setAll] = useState<CompanyOverview[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [priority, setPriority] = useState<"" | Priority>("");
  const [category, setCategory] = useState("");

  useEffect(() => {
    let alive = true;
    listCompanyOverview().then((d) => { if (alive) setAll(d); }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(all.map((c) => c.category).filter(Boolean))) as string[],
    [all],
  );

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return all.filter((c) => {
      if (ql && !c.name.toLowerCase().includes(ql)) return false;
      if (priority && c.priority !== priority) return false;
      if (category && c.category !== category) return false;
      return true;
    });
  }, [all, q, priority, category]);

  if (loading) return <div className="text-sm text-gray-500">読み込み中…</div>;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 bg-white p-3 flex flex-wrap gap-3 items-end">
        <label className="flex flex-col">
          <span className="text-[10px] font-bold text-[#afafaf] uppercase">企業名</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="例: シミズ"
            className="rounded-lg border border-gray-200 px-2 py-1 text-xs"
          />
        </label>
        <label className="flex flex-col">
          <span className="text-[10px] font-bold text-[#afafaf] uppercase">優先度</span>
          <select
            value={priority} onChange={(e) => setPriority(e.target.value as "" | Priority)}
            className="rounded-lg border border-gray-200 px-2 py-1 text-xs"
          >
            <option value="">すべて</option>
            <option value="S">S</option><option value="A">A</option><option value="B">B</option><option value="C">C</option>
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-[10px] font-bold text-[#afafaf] uppercase">カテゴリ</span>
          <select
            value={category} onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-gray-200 px-2 py-1 text-xs"
          >
            <option value="">すべて</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <div className="ml-auto text-[10px] font-bold text-[#afafaf]">{filtered.length} / {all.length} 件</div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-left text-[10px] uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 w-12">優先度</th>
              <th className="px-3 py-2">カテゴリ</th>
              <th className="px-3 py-2">企業</th>
              <th className="px-3 py-2 text-right">公開求人</th>
              <th className="px-3 py-2 text-right">◎○</th>
              <th className="px-3 py-2">採用ページ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-bold">{c.priority}</td>
                <td className="px-3 py-2 text-gray-500">{c.category ?? "-"}</td>
                <td className="px-3 py-2">
                  <button onClick={() => onOpenCompany(c.id)} className="font-bold text-[#4b4b4b] hover:underline">
                    {c.name}
                  </button>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{c.open_jobs}</td>
                <td className="px-3 py-2 text-right tabular-nums">{c.strong_matches}</td>
                <td className="max-w-xs px-3 py-2 truncate text-[10px] text-gray-500">
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
