import Link from "next/link";
import { getReady, isMock } from "@/lib/queries";
import { MarkSentButton } from "./MarkSentButton";

export const dynamic = "force-dynamic";

export default async function ReadyPage() {
  const ready = await getReady(500);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">実行待ち（◎○ × 未送信）</h1>
        <span className="text-sm text-gray-500">{ready.length} 件</span>
      </div>
      {isMock && (
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded p-3">
          モックモードのため空。Supabase 接続後に /api/cron を実行してください。
        </div>
      )}
      {ready.length === 0 ? (
        <p className="text-sm text-gray-500 bg-white border border-gray-200 rounded p-4">該当なし。</p>
      ) : (
        <div className="bg-white border border-gray-200 rounded overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-3 py-2">ランク</th>
                <th className="px-3 py-2">優先度</th>
                <th className="px-3 py-2">企業</th>
                <th className="px-3 py-2">カテゴリ</th>
                <th className="px-3 py-2">求人</th>
                <th className="px-3 py-2">候補者</th>
                <th className="px-3 py-2">スコア</th>
                <th className="px-3 py-2">経路</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {ready.map((r) => (
                <tr key={r.match_id} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-2 font-semibold">{r.match_rank}</td>
                  <td className="px-3 py-2">{r.company_priority}</td>
                  <td className="px-3 py-2">
                    <Link href={`/companies/${r.company_id}`} className="text-brand-600 hover:underline">
                      {r.company_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-gray-500">{r.company_category ?? "-"}</td>
                  <td className="px-3 py-2">
                    {r.job_url ? (
                      <a href={r.job_url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                        {r.job_title}
                      </a>
                    ) : (
                      r.job_title
                    )}
                    <div className="text-xs text-gray-400">{r.job_location ?? ""}</div>
                  </td>
                  <td className="px-3 py-2">{r.candidate_name}</td>
                  <td className="px-3 py-2">{r.match_score}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {r.hr_contact_email ?? r.inquiry_form_url ?? "-"}
                  </td>
                  <td className="px-3 py-2">
                    <MarkSentButton
                      matchId={r.match_id}
                      companyId={r.company_id}
                      jobId={r.job_id}
                      candidateId={r.candidate_id}
                      channel={r.hr_contact_email ? "email" : r.inquiry_form_url ? "form" : "other"}
                    />
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
