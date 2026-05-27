import { useEffect, useMemo, useState } from "react";
import { isLive, listOpenJobsWithContact } from "../../lib/ra/queries";
import type { JobWithCompany, Priority } from "../../lib/ra/types";
import { LoadError } from "./RaErrorBoundary";

/**
 * 募集ポジション一覧 — フラットな "1 ポジション = 1 行" のリスト。
 *
 * 各行に「企業 / ポジション / 雇用形態 / 勤務地 / 連絡経路 / 最良マッチ候補者」
 * を並べる。連絡経路 (form / email / linkedin) はクリックすると即その経路を開ける。
 * 「AI が探してきて、人は送信だけ」を一画面で完結させる視点のリスト。
 */
export default function ProspectingJobs({
  onOpenCompany,
}: {
  onOpenCompany: (id: string) => void;
}) {
  const [rows, setRows] = useState<JobWithCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [q, setQ] = useState("");
  const [priority, setPriority] = useState<"" | Priority>("");
  const [grade, setGrade] = useState<"" | "◎" | "○" | "△">("");
  const [onlyWithContact, setOnlyWithContact] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    listOpenJobsWithContact()
      .then((d) => { if (alive) setRows(d); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e : new Error(String(e))); })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [reloadKey]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (ql && !`${r.company_name}\n${r.job_title}`.toLowerCase().includes(ql)) return false;
      if (priority && r.company_priority !== priority) return false;
      if (grade && r.best_grade !== grade) return false;
      if (onlyWithContact && !(r.contact_form_url || r.contact_email)) return false;
      return true;
    }).sort((a, b) => {
      // ◎○ にスコアあり > 連絡経路あり > 優先度 S/A > 最新
      const gw = (g: typeof a.best_grade) => g === "◎" ? 0 : g === "○" ? 1 : g === "△" ? 2 : 3;
      if (gw(a.best_grade) !== gw(b.best_grade)) return gw(a.best_grade) - gw(b.best_grade);
      if ((b.best_score ?? 0) !== (a.best_score ?? 0)) return (b.best_score ?? 0) - (a.best_score ?? 0);
      return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
    });
  }, [rows, q, priority, grade, onlyWithContact]);

  if (loading) return <div className="text-sm text-gray-500">読み込み中…</div>;
  if (error) return <LoadError error={error} onRetry={() => setReloadKey((k) => k + 1)} />;

  return (
    <div className="space-y-3">
      {!isLive && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs p-3">
          モックモード — Supabase + Gemini を設定して「🕸 求人クロール」→「🎯 候補者マッチ」を実行すると、このリストが埋まります。
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col">
          <span className="text-[10px] font-bold text-[#afafaf] uppercase">企業 / 求人</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="例: 三井 / シニアFM" className="rounded-lg border border-gray-200 px-2 py-1 text-xs" />
        </label>
        <label className="flex flex-col">
          <span className="text-[10px] font-bold text-[#afafaf] uppercase">優先度</span>
          <select value={priority} onChange={(e) => setPriority(e.target.value as "" | Priority)} className="rounded-lg border border-gray-200 px-2 py-1 text-xs">
            <option value="">すべて</option>
            {(["S", "A", "B", "C"] as Priority[]).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <label className="flex flex-col">
          <span className="text-[10px] font-bold text-[#afafaf] uppercase">最良マッチ</span>
          <select value={grade} onChange={(e) => setGrade(e.target.value as typeof grade)} className="rounded-lg border border-gray-200 px-2 py-1 text-xs">
            <option value="">すべて</option>
            <option value="◎">◎ のみ</option>
            <option value="○">○ 以上</option>
            <option value="△">△ 以上</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-[10px] font-bold text-[#4b4b4b]">
          <input type="checkbox" checked={onlyWithContact} onChange={(e) => setOnlyWithContact(e.target.checked)} />
          <span>連絡経路あり のみ</span>
        </label>
        <div className="ml-auto text-[10px] font-bold text-[#afafaf]">{filtered.length} / {rows.length} 件</div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-left text-[10px] uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">マッチ</th>
              <th className="px-3 py-2">企業</th>
              <th className="px-3 py-2">募集ポジション</th>
              <th className="px-3 py-2">雇用形態</th>
              <th className="px-3 py-2">勤務地</th>
              <th className="px-3 py-2">最良候補者</th>
              <th className="px-3 py-2">連絡経路</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">該当なし — クロール / マッチ未実行 or フィルタが厳しすぎ</td></tr>
            ) : filtered.map((r) => (
              <tr key={r.job_id} className="border-t border-gray-100 align-top">
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.best_grade ? (
                    <span className={`font-black ${r.best_grade === "◎" ? "text-green-600" : r.best_grade === "○" ? "text-blue-500" : "text-gray-500"}`}>
                      {r.best_grade}{" "}
                      <span className="text-[10px] tabular-nums">{r.best_score ?? ""}</span>
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-300">未採点</span>
                  )}
                </td>
                <td className="px-3 py-2 max-w-[120px]">
                  <button onClick={() => onOpenCompany(r.company_id)} className="font-bold text-[#4b4b4b] hover:underline truncate block">
                    {r.company_name}
                  </button>
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-1.5 text-[10px] text-gray-500">{r.company_priority}</span>
                </td>
                <td className="px-3 py-2 max-w-[260px]">
                  <div className="font-bold text-[#4b4b4b] truncate">{r.job_title}</div>
                  {r.job_url && (
                    <a href={r.job_url} target="_blank" rel="noreferrer" className="text-[10px] text-gray-400 hover:underline">求人を開く</a>
                  )}
                </td>
                <td className="px-3 py-2 text-[10px] text-gray-500">{r.employment_type ?? "-"}</td>
                <td className="px-3 py-2 text-[10px] text-gray-500">{r.location ?? "-"}</td>
                <td className="px-3 py-2 text-[10px] text-gray-500">{r.best_candidate_name ?? "-"}</td>
                <td className="px-3 py-2 text-[10px]">
                  <div className="flex gap-1 flex-wrap">
                    {r.contact_form_url && (
                      <a href={r.contact_form_url} target="_blank" rel="noreferrer"
                        className="px-1.5 py-0.5 rounded-full bg-[#1CB0F6] text-white font-bold hover:bg-[#1899D6]">
                        📝 フォーム
                      </a>
                    )}
                    {r.contact_email && (
                      <a href={r.contact_email.startsWith("http") ? r.contact_email : `mailto:${r.contact_email}`}
                        target="_blank" rel="noreferrer"
                        className="px-1.5 py-0.5 rounded-full bg-[#58CC02] text-white font-bold hover:bg-[#46a302]">
                        ✉️ メール
                      </a>
                    )}
                    {r.recruit_page_url && !r.contact_form_url && (
                      <a href={r.recruit_page_url} target="_blank" rel="noreferrer"
                        className="px-1.5 py-0.5 rounded-full bg-gray-200 text-[#4b4b4b] font-bold">
                        採用ページ
                      </a>
                    )}
                    {!r.contact_form_url && !r.contact_email && !r.recruit_page_url && (
                      <button onClick={() => onOpenCompany(r.company_id)} className="text-gray-400 hover:underline">
                        (未登録 — 補完)
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-[#afafaf]">
        並び順: 最良マッチ等級 (◎○△) → スコア降順 → 更新日新しい順
        / 連絡経路が空の会社は企業詳細の「🤖 URL を自動補完」で AI 推定できます
      </p>
    </div>
  );
}
