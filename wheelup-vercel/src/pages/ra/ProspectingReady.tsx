import { useEffect, useState } from "react";
import { api, isLive, listReady } from "../../lib/ra/queries";
import type { ReadyRow } from "../../lib/ra/types";

/**
 * 実行待ち — ◎○ かつ未送信。ここから人が連絡先 URL を開いて文章を書いて送信、
 * 終わったら「✓ 送信記録」を押す。AI は採点・連絡先抽出までで、文面作成はやらない。
 */
export default function ProspectingReady({
  onOpenCompany,
}: {
  onOpenCompany: (id: string) => void;
}) {
  const [rows, setRows] = useState<ReadyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listReady(500).then((d) => { if (alive) setRows(d); }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  async function markSent(r: ReadyRow) {
    setErr(null);
    try {
      await api.activity({
        company_id: r.company_id, job_id: r.job_id, candidate_id: r.candidate_id,
        kind: "sent", channel: "manual",
        body: `${r.candidate_name} → ${r.company_name} / ${r.job_title}`,
      });
      setSent((s) => ({ ...s, [r.match_id]: true }));
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  if (loading) return <div className="text-sm text-gray-500">読み込み中…</div>;

  return (
    <div className="space-y-3">
      {!isLive && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs p-3">
          モックモードでは LLM 採点を行いません。<code className="mx-1">🕸 求人クロール</code> → <code className="mx-1">🎯 候補者マッチ</code> を回すと、ここに ◎○ が並びます。
        </div>
      )}
      {err && <div className="text-xs text-red-600">{err}</div>}

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-left text-[10px] uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">判定</th>
              <th className="px-3 py-2">点数</th>
              <th className="px-3 py-2">企業</th>
              <th className="px-3 py-2">求人</th>
              <th className="px-3 py-2">候補者</th>
              <th className="px-3 py-2">理由</th>
              <th className="px-3 py-2">送信先</th>
              <th className="px-3 py-2 text-right">記録</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">該当なし</td></tr>
            ) : rows.map((r) => {
              const form = r.company_contact_paths?.find((p) => p.kind === "form");
              const email = r.company_contact_paths?.find((p) => p.kind === "email");
              return (
                <tr key={r.match_id} className="border-t border-gray-100">
                  <td className={`px-3 py-2 font-black ${r.grade === "◎" ? "text-green-600" : "text-blue-500"}`}>{r.grade}</td>
                  <td className="px-3 py-2 tabular-nums">{r.score}</td>
                  <td className="px-3 py-2">
                    <button onClick={() => onOpenCompany(r.company_id)} className="font-bold text-[#4b4b4b] hover:underline">
                      {r.company_name}
                    </button>
                    <span className="ml-2 inline-flex items-center rounded-full bg-gray-100 px-1.5 text-[10px] text-gray-500">
                      {r.company_priority}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {r.job_url ? (
                      <a href={r.job_url} target="_blank" rel="noreferrer" className="hover:underline">{r.job_title}</a>
                    ) : r.job_title}
                  </td>
                  <td className="px-3 py-2 text-gray-500">{r.candidate_name}</td>
                  <td className="px-3 py-2 max-w-xs text-[10px] text-gray-500 truncate">
                    {(r.reasons ?? []).slice(0, 2).join(" / ")}
                  </td>
                  <td className="px-3 py-2 text-[10px]">
                    <div className="flex gap-1 flex-wrap">
                      {form && (
                        <a href={form.url} target="_blank" rel="noreferrer"
                          className="px-1.5 py-0.5 rounded-full bg-[#1CB0F6] text-white font-bold hover:bg-[#1899D6]">
                          📝 form
                        </a>
                      )}
                      {email && (
                        <a href={email.url ?? `mailto:${email.value}`} target="_blank" rel="noreferrer"
                          className="px-1.5 py-0.5 rounded-full bg-[#58CC02] text-white font-bold hover:bg-[#46a302]">
                          ✉️ mail
                        </a>
                      )}
                      {!form && !email && (
                        <button onClick={() => onOpenCompany(r.company_id)} className="text-gray-400 hover:underline">
                          未登録
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {sent[r.match_id] ? (
                      <span className="text-[10px] text-green-600 font-bold">送信記録済</span>
                    ) : (
                      <button
                        onClick={() => markSent(r)}
                        className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-[#1CB0F6] text-white hover:bg-[#1899D6]"
                      >
                        ✓ 送信記録
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-[#afafaf]">
        送信先の 📝 form / ✉️ mail をクリックして送信 → 戻ってきたら「✓ 送信記録」で重複防止
      </p>
    </div>
  );
}
