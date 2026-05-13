import { useEffect, useState } from "react";
import { api, isLive, listDiscovery } from "../../lib/ra/queries";
import type { DiscoveryRow, Priority } from "../../lib/ra/types";

export default function ProspectingDiscovery() {
  const [rows, setRows] = useState<DiscoveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function reload() {
    setLoading(true);
    listDiscovery().then(setRows).finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, []);

  async function decide(row: DiscoveryRow, action: "approve" | "reject", priority: Priority = "B") {
    setBusy(row.id); setErr(null); setMsg(null);
    try {
      const r = await api.approveDiscovery(row.id, action === "reject" ? { reject: true } : { priority });
      setMsg(action === "approve" ? `${row.name} を ${priority} ランクで企業マスタへ昇格` : `${row.name} を却下`);
      setRows((arr) => arr.filter((x) => x.id !== row.id));
      // background: trigger find-contact-info for the new company
      if (action === "approve" && r.company_id) {
        api.findContactInfo({ company_id: r.company_id }).catch(() => undefined);
      }
    } catch (e) {
      setErr(`${row.name}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="text-sm text-gray-500">読み込み中…</div>;

  return (
    <div className="space-y-3">
      {!isLive && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs p-3">
          モックモード — Supabase + Gemini を設定し<code className="mx-1">🔍 新規企業発掘</code>を実行すると、ここに候補が並びます。
        </div>
      )}
      {err && <div className="text-[10px] text-red-600">{err}</div>}
      {msg && <div className="text-[10px] text-green-700">{msg}</div>}

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-left text-[10px] uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">企業名</th>
              <th className="px-3 py-2">カテゴリ</th>
              <th className="px-3 py-2">提案理由</th>
              <th className="px-3 py-2">参考 URL</th>
              <th className="px-3 py-2 text-right">承認</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">キューは空です</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100">
                <td className="px-3 py-2 font-bold text-[#4b4b4b]">{r.name}</td>
                <td className="px-3 py-2 text-gray-500">{r.category ?? "-"}</td>
                <td className="px-3 py-2 text-[10px] text-gray-500">{r.reason ?? "-"}</td>
                <td className="max-w-xs px-3 py-2 truncate text-[10px]">
                  {r.hint_url ? <a href={r.hint_url} target="_blank" rel="noreferrer" className="hover:underline">{r.hint_url}</a> : "-"}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex gap-1">
                    {(["S", "A", "B"] as Priority[]).map((p) => (
                      <button
                        key={p}
                        disabled={busy === r.id}
                        onClick={() => decide(r, "approve", p)}
                        className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-[#58CC02] text-white hover:bg-[#46a302] disabled:opacity-50"
                        title={`${p} ランクで承認`}
                      >
                        ✓{p}
                      </button>
                    ))}
                    <button
                      disabled={busy === r.id}
                      onClick={() => decide(r, "reject")}
                      className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-gray-200 text-[#4b4b4b] hover:bg-gray-300 disabled:opacity-50"
                    >
                      却下
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[#afafaf]">
        承認すると ra_companies に挿入され、バックグラウンドで連絡経路 URL も自動推定が走ります（数秒）。
      </p>
    </div>
  );
}
