import { useEffect, useState } from "react";
import { isLive, listDiscovery } from "../../lib/ra/queries";
import type { DiscoveryRow } from "../../lib/ra/types";

export default function ProspectingDiscovery() {
  const [rows, setRows] = useState<DiscoveryRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    listDiscovery().then((d) => { if (alive) setRows(d); }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="text-sm text-gray-500">読み込み中…</div>;

  return (
    <div className="space-y-3">
      {!isLive && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs p-3">
          モックモードでは LLM 発掘を行いません。Supabase + Gemini を設定し
          <code className="mx-1">POST /api/ra/discover</code> を叩くと、ここに新規候補企業が並びます。
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-left text-[10px] uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">企業名</th>
              <th className="px-3 py-2">カテゴリ</th>
              <th className="px-3 py-2">理由</th>
              <th className="px-3 py-2">参考 URL</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">キューは空です</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-bold text-[#4b4b4b]">{r.name}</td>
                <td className="px-3 py-2 text-gray-500">{r.category ?? "-"}</td>
                <td className="px-3 py-2 text-[10px] text-gray-500">{r.reason ?? "-"}</td>
                <td className="max-w-xs px-3 py-2 truncate text-[10px]">
                  {r.hint_url ? <a href={r.hint_url} target="_blank" rel="noreferrer" className="hover:underline">{r.hint_url}</a> : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
