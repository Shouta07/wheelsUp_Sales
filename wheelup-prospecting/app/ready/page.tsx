import Link from "next/link";

import { listReady } from "@/lib/queries";
import { isLive } from "@/lib/supabase";
import { MarkSentButton } from "./mark-sent";

export const dynamic = "force-dynamic";

export default async function ReadyPage() {
  const rows = await listReady(500);
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <h1 className="text-xl font-semibold">実行待ち（◎○マッチ × 未送信）</h1>
        <span className="text-sm text-mute">{rows.length}件</span>
      </div>

      {!isLive && (
        <p className="text-sm text-mute">
          モックモードでは LLM 採点を行いません。Supabase + Gemini を設定して
          <code className="mx-1">POST /api/match</code>
          を叩くと、ここに ◎○ の組み合わせが並びます。
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-mute">該当なし。</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-mute">
              <tr>
                <th className="px-3 py-2">判定</th>
                <th className="px-3 py-2">点数</th>
                <th className="px-3 py-2">企業</th>
                <th className="px-3 py-2">求人</th>
                <th className="px-3 py-2">候補者</th>
                <th className="px-3 py-2">理由(抜粋)</th>
                <th className="px-3 py-2 text-right">送信</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.match_id} className="border-t border-line">
                  <td className="px-3 py-2 font-semibold">{r.grade}</td>
                  <td className="px-3 py-2 tabular-nums">{r.score}</td>
                  <td className="px-3 py-2">
                    <Link href={`/companies/${r.company_id}`} className="hover:underline">
                      {r.company_name}
                    </Link>
                    <span className="ml-2 chip">{r.company_priority}</span>
                  </td>
                  <td className="px-3 py-2">
                    {r.job_url ? (
                      <a href={r.job_url} target="_blank" rel="noreferrer" className="hover:underline">
                        {r.job_title}
                      </a>
                    ) : (
                      r.job_title
                    )}
                  </td>
                  <td className="px-3 py-2 text-mute">{r.candidate_name}</td>
                  <td className="max-w-xs px-3 py-2 text-xs text-mute">
                    {(r.reasons ?? []).slice(0, 2).join(" / ")}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <MarkSentButton row={r} />
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
