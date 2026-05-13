import { listDiscovery } from "@/lib/queries";
import { isLive } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function DiscoveryPage() {
  const rows = await listDiscovery();

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <h1 className="text-xl font-semibold">新規発掘キュー</h1>
        <span className="text-sm text-mute">{rows.length}件 pending</span>
      </div>

      {!isLive && (
        <p className="text-sm text-mute">
          モックモードでは LLM 発掘を行いません。Supabase + Gemini を設定して
          <code className="mx-1">POST /api/discover</code>
          を叩くと、ここに新規候補企業が並びます。
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-mute">発掘キューは空です。</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-mute">
              <tr>
                <th className="px-3 py-2">企業名</th>
                <th className="px-3 py-2">カテゴリ</th>
                <th className="px-3 py-2">理由</th>
                <th className="px-3 py-2">参考URL</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 text-mute">{r.category ?? "-"}</td>
                  <td className="px-3 py-2 text-xs text-mute">{r.reason ?? "-"}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-xs">
                    {r.hint_url ? (
                      <a href={r.hint_url} target="_blank" rel="noreferrer" className="hover:underline">{r.hint_url}</a>
                    ) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
