import { useEffect, useMemo, useState } from "react";
import { api, isLive, listCompanyOverview, listOpenJobsWithContact } from "../../lib/ra/queries";
import type { CompanyOverview, JobWithCompany, Priority } from "../../lib/ra/types";
import Modal from "./Modal";

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
  const [q, setQ] = useState("");
  const [priority, setPriority] = useState<"" | Priority>("");
  const [grade, setGrade] = useState<"" | "◎" | "○" | "△">("");
  const [onlyWithContact, setOnlyWithContact] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listOpenJobsWithContact()
      .then((d) => { if (alive) setRows(d); })
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
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] font-bold text-[#afafaf]">{filtered.length} / {rows.length} 件</span>
          <button
            onClick={() => setShowAdd(true)}
            disabled={!isLive}
            title={isLive ? "求人を手動で追加" : "Supabase未接続"}
            className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-[#58CC02] text-white hover:bg-[#46a302] disabled:opacity-40"
          >
            ＋ 求人追加
          </button>
        </div>
      </div>

      {showAdd && (
        <AddJobModal
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); setReloadKey((k) => k + 1); }}
        />
      )}

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

// ---------------------------------------------------------------------------
// ＋ 求人追加モーダル — ra_jobs に手動 INSERT
// ---------------------------------------------------------------------------
function AddJobModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [companies, setCompanies] = useState<CompanyOverview[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [companyQuery, setCompanyQuery] = useState("");
  const [title, setTitle] = useState("");
  const [employmentType, setEmploymentType] = useState("正社員");
  const [location, setLocation] = useState("");
  const [salaryRange, setSalaryRange] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const [requirements, setRequirements] = useState("");
  const [runMatch, setRunMatch] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listCompanyOverview().then((d) => { if (alive) setCompanies(d); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const filteredCompanies = useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    return q
      ? companies.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 50)
      : companies.slice(0, 50);
  }, [companies, companyQuery]);

  async function submit() {
    setErr(null); setResult(null);
    if (!companyId) { setErr("企業を選んでください"); return; }
    if (!title.trim()) { setErr("ポジション名は必須です"); return; }
    setBusy(true);
    try {
      const r = await api.addJob({
        company_id: companyId,
        title: title.trim(),
        description: description.trim() || null,
        requirements: requirements.trim() || null,
        employment_type: employmentType.trim() || null,
        location: location.trim() || null,
        salary_range: salaryRange.trim() || null,
        url: url.trim() || null,
        run_match: runMatch,
      });
      const matched = (r.match as { scored?: number } | null)?.scored;
      setResult(`追加しました${runMatch && typeof matched === "number" ? ` / 候補者マッチ ${matched} 件採点済` : ""}`);
      setTimeout(onAdded, 800);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="求人を手動で追加" onClose={onClose} wide>
      <div className="space-y-3 text-xs">
        <div>
          <div className="text-[10px] font-bold text-[#afafaf] uppercase mb-0.5">企業 (必須)</div>
          <input
            value={companyQuery}
            onChange={(e) => setCompanyQuery(e.target.value)}
            placeholder="企業名で絞り込み..."
            className="rounded border border-gray-200 px-2 py-1 w-full mb-1"
          />
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="rounded border border-gray-200 px-2 py-1 w-full"
            size={Math.min(8, Math.max(3, filteredCompanies.length))}
          >
            {filteredCompanies.length === 0 && <option disabled>該当なし</option>}
            {filteredCompanies.map((c) => (
              <option key={c.id} value={c.id}>
                [{c.priority}] {c.name}{c.category ? ` — ${c.category}` : ""}
              </option>
            ))}
          </select>
        </div>

        <Labeled label="ポジション名 (必須)">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: 大規模物流施設PM" className="rounded border border-gray-200 px-2 py-1 w-full" />
        </Labeled>

        <div className="grid grid-cols-3 gap-2">
          <Labeled label="雇用形態">
            <select value={employmentType} onChange={(e) => setEmploymentType(e.target.value)} className="rounded border border-gray-200 px-2 py-1 w-full">
              {["正社員", "契約", "業務委託", "派遣", "その他"].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Labeled>
          <Labeled label="勤務地">
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="例: 東京23区" className="rounded border border-gray-200 px-2 py-1 w-full" />
          </Labeled>
          <Labeled label="想定年収">
            <input value={salaryRange} onChange={(e) => setSalaryRange(e.target.value)} placeholder="例: 700-900万円" className="rounded border border-gray-200 px-2 py-1 w-full" />
          </Labeled>
        </div>

        <Labeled label="求人URL (任意)">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://..." className="rounded border border-gray-200 px-2 py-1 w-full" />
        </Labeled>

        <Labeled label="必須要件">
          <textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} placeholder="例: 1級建築施工管理技士／実務10年以上／英語ビジネスレベル" className="rounded border border-gray-200 px-2 py-1 w-full h-16" />
        </Labeled>

        <Labeled label="ポジション概要">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="求人内容・募集背景・任せたい業務など" className="rounded border border-gray-200 px-2 py-1 w-full h-24" />
        </Labeled>

        <label className="flex items-center gap-1.5 text-[10px] font-bold text-[#4b4b4b]">
          <input type="checkbox" checked={runMatch} onChange={(e) => setRunMatch(e.target.checked)} />
          <span>追加後、候補者×この求人のマッチ判定を Gemini で即実行する</span>
        </label>

        {err && <div className="text-[10px] text-red-600">{err}</div>}
        {result && <div className="text-[10px] text-green-700">{result}</div>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 rounded-lg text-[10px] font-bold border border-gray-200">キャンセル</button>
          <button onClick={submit} disabled={busy} className="px-3 py-1 rounded-lg text-[10px] font-black bg-[#58CC02] text-white disabled:opacity-50">
            {busy ? "保存中…" : runMatch ? "追加してマッチ判定" : "追加する"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[10px] font-bold text-[#afafaf] uppercase mb-0.5">{label}</div>
      {children}
    </label>
  );
}
