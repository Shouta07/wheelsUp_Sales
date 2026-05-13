import { getDiscovery, isMock } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DiscoveryPage() {
  const items = await getDiscovery();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">発掘キュー（LLM提案）</h1>
        <span className="text-sm text-gray-500">{items.length} 件</span>
      </div>
      {isMock && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded p-3">
          モックモードでは空。Supabase 接続後に POST /api/discover を実行してください。
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-sm text-gray-500 bg-white border border-gray-200 rounded p-4">該当なし。</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-3 py-2">企業名</th>
                <th className="px-3 py-2">カテゴリ</th>
                <th className="px-3 py-2">HP</th>
                <th className="px-3 py-2">理由</th>
                <th className="px-3 py-2">状態</th>
                <th className="px-3 py-2">提案日時</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-2 font-medium">{d.name}</td>
                  <td className="px-3 py-2 text-gray-500">{d.category_hint ?? "-"}</td>
                  <td className="px-3 py-2 text-xs">
                    {d.homepage_url ? (
                      <a href={d.homepage_url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                        {d.homepage_url}
                      </a>
                    ) : "-"}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{d.reason}</td>
                  <td className="px-3 py-2 text-xs">{d.status}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{new Date(d.created_at).toLocaleString("ja-JP")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
