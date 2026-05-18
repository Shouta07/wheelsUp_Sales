import { useEffect, useMemo, useState } from "react";
import { APPROACH_STATUSES, api, listCompaniesEnriched } from "../../lib/ra/queries";
import type { ApproachStatus, CompanyEnriched } from "../../lib/ra/queries";
import type { Priority } from "../../lib/ra/types";
import Modal from "./Modal";
import { parseCsv } from "../../lib/ra/csv";

export default function ProspectingCompanies({
  onOpenCompany,
}: {
  onOpenCompany: (id: string) => void;
}) {
  const [all, setAll] = useState<CompanyEnriched[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [priority, setPriority] = useState<"" | Priority>("");
  const [category, setCategory] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | ApproachStatus>("");
  const [showAdd, setShowAdd] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listCompaniesEnriched().then((d) => { if (alive) setAll(d); }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [reloadKey]);

  const categories = useMemo(
    () => Array.from(new Set(all.map((c) => c.category).filter(Boolean))) as string[],
    [all],
  );

  // ステータス別の件数 — フィルタチップに表示
  const statusCounts = useMemo(() => {
    const counts: Record<ApproachStatus, number> = {
      untouched: 0, sent: 0, replied: 0, meeting: 0, closed: 0,
    };
    for (const c of all) counts[c.approach_status] = (counts[c.approach_status] ?? 0) + 1;
    return counts;
  }, [all]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return all.filter((c) => {
      if (ql && !c.name.toLowerCase().includes(ql)) return false;
      if (priority && c.priority !== priority) return false;
      if (category && c.category !== category) return false;
      if (statusFilter && c.approach_status !== statusFilter) return false;
      return true;
    });
  }, [all, q, priority, category, statusFilter]);

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
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] font-bold text-[#afafaf]">{filtered.length} / {all.length} 件</span>
          <button
            onClick={() => setShowAdd(true)}
            className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-[#58CC02] text-white hover:bg-[#46a302]"
          >
            ＋ 追加
          </button>
        </div>
      </div>

      {showAdd && (
        <AddCompanyModal
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); setReloadKey((k) => k + 1); }}
        />
      )}

      {/* アプローチ状況フィルタチップ */}
      <div className="flex flex-wrap gap-1.5 text-[10px] font-bold">
        <button
          onClick={() => setStatusFilter("")}
          className={`px-2 py-1 rounded-full ${
            statusFilter === "" ? "bg-[#4b4b4b] text-white" : "bg-white border border-[#e5e5e5] text-[#4b4b4b]"
          }`}
        >
          すべて {all.length}
        </button>
        {APPROACH_STATUSES.map((s) => (
          <button
            key={s.key}
            onClick={() => setStatusFilter(statusFilter === s.key ? "" : s.key)}
            className={`px-2 py-1 rounded-full ${
              statusFilter === s.key
                ? "bg-[#1CB0F6] text-white"
                : "bg-white border border-[#e5e5e5] text-[#4b4b4b] hover:bg-gray-50"
            }`}
          >
            {s.label} {statusCounts[s.key] ?? 0}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-left text-[10px] uppercase text-gray-500">
            <tr>
              <th className="px-2 py-2 w-12">優先度</th>
              <th className="px-2 py-2">企業</th>
              <th className="px-2 py-2">カテゴリ</th>
              <th className="px-2 py-2">アプローチ</th>
              <th className="px-2 py-2 text-right">送信</th>
              <th className="px-2 py-2 text-right">返信</th>
              <th className="px-2 py-2 text-right">商談</th>
              <th className="px-2 py-2 text-right">成約</th>
              <th className="px-2 py-2">最終接触</th>
              <th className="px-2 py-2 text-right">求人</th>
              <th className="px-2 py-2 text-right">◎○</th>
              <th className="px-2 py-2">送信先</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const form = c.contact_paths.find((p) => p.kind === "form");
              const email = c.contact_paths.find((p) => p.kind === "email");
              const linkedin = c.contact_paths.find((p) => p.kind === "linkedin");
              const counts = c.activity_counts;
              const statusDef = APPROACH_STATUSES.find((s) => s.key === c.approach_status)!;
              return (
                <tr key={c.id} className="border-t border-gray-100">
                  <td className="px-2 py-2 font-bold">{c.priority}</td>
                  <td className="px-2 py-2">
                    <button onClick={() => onOpenCompany(c.id)} className="font-bold text-[#4b4b4b] hover:underline">
                      {c.name}
                    </button>
                  </td>
                  <td className="px-2 py-2 text-gray-500">{c.category ?? "-"}</td>
                  <td className="px-2 py-2">
                    <span className={`text-[10px] font-bold ${statusDef.color}`}>● {statusDef.label}</span>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{numOrDash(counts.sent)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{numOrDash(counts.replied)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{numOrDash(counts.meeting)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{numOrDash(counts.closed)}</td>
                  <td className="px-2 py-2 text-[10px] text-gray-500 whitespace-nowrap">
                    {c.last_activity_at ? `${formatAgo(c.last_activity_at)} (${c.last_activity_kind})` : "-"}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.open_jobs}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{c.strong_matches}</td>
                  <td className="px-2 py-2 text-[10px]">
                    <div className="flex gap-1 flex-wrap">
                      {form && (
                        <a href={form.url} target="_blank" rel="noreferrer"
                          className="px-1.5 py-0.5 rounded-full bg-[#1CB0F6] text-white font-bold hover:bg-[#1899D6]">
                          📝
                        </a>
                      )}
                      {email && (
                        <a href={email.url ?? `mailto:${email.value}`} target="_blank" rel="noreferrer"
                          className="px-1.5 py-0.5 rounded-full bg-[#58CC02] text-white font-bold hover:bg-[#46a302]">
                          ✉️
                        </a>
                      )}
                      {linkedin && (
                        <a href={linkedin.url} target="_blank" rel="noreferrer"
                          className="px-1.5 py-0.5 rounded-full bg-gray-700 text-white font-bold hover:bg-gray-800">
                          in
                        </a>
                      )}
                      {!form && !email && !linkedin && c.recruit_page_url && (
                        <a href={c.recruit_page_url} target="_blank" rel="noreferrer"
                          className="text-gray-400 hover:underline">
                          採用ページ
                        </a>
                      )}
                      {!form && !email && !linkedin && !c.recruit_page_url && (
                        <button onClick={() => onOpenCompany(c.id)} className="text-gray-300 hover:underline">
                          未登録
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && (
        <p className="text-center text-xs text-gray-400 py-4">条件に合う企業はありません</p>
      )}
    </div>
  );
}

function numOrDash(n: number | undefined): string {
  return n && n > 0 ? String(n) : "-";
}

function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "数秒前";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}時間前`;
  if (diff < 86_400_000 * 30) return `${Math.floor(diff / 86_400_000)}日前`;
  return new Date(iso).toLocaleDateString("ja-JP");
}

// ---------------------------------------------------------------------------
// + 追加 モーダル — 単体追加 + CSV ペースト
// ---------------------------------------------------------------------------

function AddCompanyModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [mode, setMode] = useState<"single" | "csv">("single");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // single
  const [name, setName] = useState("");
  const [cat, setCat] = useState("");
  const [pri, setPri] = useState<Priority>("B");
  const [url, setUrl] = useState("");

  // csv
  const [csvText, setCsvText] = useState(
    "name,category,priority,recruit_page_url\n例: 〇〇ファシリティ,FM,B,https://example.co.jp/recruit/",
  );

  async function submit() {
    setPending(true); setErr(null); setResult(null);
    try {
      const rows: Array<Record<string, unknown>> = mode === "single"
        ? [{ name: name.trim(), category: cat || null, priority: pri, recruit_page_url: url || null }]
        : parseCsv(csvText).map((r) => ({
            name: r.name,
            category: r.category || null,
            priority: (r.priority || "B").toUpperCase(),
            recruit_page_url: r.recruit_page_url || null,
            corporate_url: r.corporate_url || null,
            location: r.location || null,
            employee_size: r.employee_size || null,
            notes: r.notes || null,
          })).filter((r) => r.name);
      if (rows.length === 0) { setErr("入力が空です"); return; }
      const r = await api.addCompanies(rows);
      setResult(`${r.added} 件追加: ${r.names.slice(0, 5).join(", ")}${r.names.length > 5 ? ", …" : ""}`);
      setTimeout(onAdded, 800);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal title="企業を追加" onClose={onClose} wide={mode === "csv"}>
      <div className="mb-3 flex gap-1">
        {(["single", "csv"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-2 py-1 rounded-lg text-[10px] font-black ${
              mode === m ? "bg-[#1CB0F6] text-white" : "bg-gray-100 text-[#4b4b4b]"
            }`}
          >
            {m === "single" ? "1 社追加" : "CSV ペースト"}
          </button>
        ))}
      </div>

      {mode === "single" ? (
        <div className="space-y-2 text-xs">
          <Labeled label="企業名 (必須)"><input value={name} onChange={(e) => setName(e.target.value)} className="rounded border border-gray-200 px-2 py-1 w-full" /></Labeled>
          <Labeled label="カテゴリ">
            <select value={cat} onChange={(e) => setCat(e.target.value)} className="rounded border border-gray-200 px-2 py-1 w-full">
              <option value="">未設定</option>
              {["建築設備", "FM", "PM", "施設管理", "ゼネコン", "サブコン", "その他"].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Labeled>
          <Labeled label="優先度">
            <select value={pri} onChange={(e) => setPri(e.target.value as Priority)} className="rounded border border-gray-200 px-2 py-1 w-full">
              {(["S", "A", "B", "C"] as Priority[]).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Labeled>
          <Labeled label="採用ページ URL (任意 — 後で自動補完可)">
            <input value={url} onChange={(e) => setUrl(e.target.value)} className="rounded border border-gray-200 px-2 py-1 w-full" placeholder="https://..." />
          </Labeled>
        </div>
      ) : (
        <div className="space-y-2 text-xs">
          <p className="text-[10px] text-[#afafaf]">
            ヘッダ行: name, category, priority, recruit_page_url, corporate_url, location, employee_size, notes
            (name 列だけ必須)
          </p>
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            className="rounded border border-gray-200 px-2 py-2 w-full h-48 font-mono text-[11px]"
          />
        </div>
      )}

      {err && <div className="mt-2 text-[10px] text-red-600">{err}</div>}
      {result && <div className="mt-2 text-[10px] text-green-700">{result}</div>}

      <div className="mt-3 flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-1 rounded-lg text-[10px] font-bold border border-gray-200">キャンセル</button>
        <button onClick={submit} disabled={pending} className="px-3 py-1 rounded-lg text-[10px] font-black bg-[#58CC02] text-white disabled:opacity-50">
          {pending ? "追加中…" : "追加する"}
        </button>
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
