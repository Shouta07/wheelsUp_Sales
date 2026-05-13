import { useEffect, useState } from "react";
import { api, getCompanyDetail } from "../../lib/ra/queries";
import type { Activity, Company, CompanyOverview, ContactPath, Job, Priority, ReadyRow } from "../../lib/ra/types";
import Modal from "./Modal";

type Detail = {
  overview: CompanyOverview | null;
  contact_paths: Company["contact_paths"];
  notes: string | null;
  jobs: Job[];
  matches: ReadyRow[];
  activities: Activity[];
};

export default function ProspectingCompanyDetail({
  id,
  onBack,
}: {
  id: string;
  onBack: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [showEdit, setShowEdit] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [pipedrive, setPipedrive] = useState<Awaited<ReturnType<typeof api.pipedriveMatch>>["matches"] | null>(null);
  const [enrichBusy, setEnrichBusy] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getCompanyDetail(id).then((d) => { if (alive) setDetail(d as Detail | null); }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [id, reloadKey]);

  useEffect(() => {
    let alive = true;
    api.pipedriveMatch(id).then((r) => { if (alive) setPipedrive(r.matches); }).catch(() => setPipedrive([]));
    return () => { alive = false; };
  }, [id]);

  async function autoFill() {
    setEnrichBusy(true); setEnrichMsg(null);
    try {
      const r = await api.findContactInfo({ company_id: id });
      const found = [r.contact_form_url && "form", r.contact_email && "email", r.linkedin_url && "linkedin", r.recruit_page_url && "recruit"]
        .filter(Boolean).join(" / ");
      setEnrichMsg(found ? `補完済: ${found} (confidence ${(r.confidence ?? 0).toFixed(1)})` : "情報を確証できませんでした");
      setReloadKey((k) => k + 1);
    } catch (e) {
      setEnrichMsg(`失敗: ${(e as Error).message}`);
    } finally {
      setEnrichBusy(false);
    }
  }

  if (loading) return <div className="text-sm text-gray-500">読み込み中…</div>;
  if (!detail || !detail.overview) {
    return (
      <div>
        <button onClick={onBack} className="text-xs font-bold text-[#afafaf] hover:underline">← 企業一覧へ</button>
        <p className="mt-3 text-sm text-gray-500">企業が見つかりません。</p>
      </div>
    );
  }

  const { overview, contact_paths, notes, jobs, matches, activities } = detail;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <button onClick={onBack} className="text-xs font-bold text-[#afafaf] hover:underline">← 企業一覧へ</button>
          <h2 className="mt-2 text-xl font-black text-[#4b4b4b]">{overview.name}</h2>
          <div className="mt-1 flex gap-1.5 flex-wrap text-[10px] font-bold">
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[#4b4b4b]">優先度 {overview.priority}</span>
            {overview.category && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[#4b4b4b]">{overview.category}</span>}
            {overview.last_crawled_at && (
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[#afafaf]">
                最終クロール {new Date(overview.last_crawled_at).toLocaleString("ja-JP")}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <button onClick={() => setShowEdit(true)} className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-white border border-gray-200 hover:bg-gray-50">
            ✎ 編集
          </button>
          <button onClick={autoFill} disabled={enrichBusy} className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-[#CE82FF] text-white hover:bg-purple-500 disabled:opacity-50">
            {enrichBusy ? "推定中…" : "🤖 URL を自動補完"}
          </button>
          {enrichMsg && <span className="text-[10px] text-gray-500 max-w-[200px] text-right">{enrichMsg}</span>}
        </div>
      </div>

      <section className="grid gap-3 md:grid-cols-2">
        <Card title="連絡経路">
          {contact_paths.length === 0 ? (
            <p className="text-xs text-gray-500">未登録 — 右上の「URL を自動補完」でAI推定</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {contact_paths.map((p, i) => (
                <li key={i}>
                  <span className="mr-2 px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-bold">{p.kind}</span>
                  {p.url ? <a className="hover:underline text-[#1CB0F6]" href={p.url} target="_blank" rel="noreferrer">{p.url}</a> : p.value}
                </li>
              ))}
            </ul>
          )}
          {overview.recruit_page_url && (
            <p className="mt-2 text-[10px] text-gray-500">
              採用ページ:{" "}
              <a href={overview.recruit_page_url} target="_blank" rel="noreferrer" className="hover:underline">
                {overview.recruit_page_url}
              </a>
            </p>
          )}
          {notes && <p className="mt-2 text-[10px] text-gray-500">📝 {notes}</p>}
        </Card>

        <Card title="公開求人">
          {jobs.length === 0 ? (
            <p className="text-xs text-gray-500">未取得 — クロール実行で集まります</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {jobs.map((j) => (
                <li key={j.id} className="flex items-center gap-2">
                  <span className={`text-[10px] font-black ${j.is_open ? "text-green-600" : "text-gray-400"}`}>
                    {j.is_open ? "OPEN" : "CLOSED"}
                  </span>
                  <span className="flex-1 truncate">{j.title}</span>
                  {j.url && <a href={j.url} target="_blank" rel="noreferrer" className="text-[10px] text-gray-400 hover:underline">link</a>}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {pipedrive && pipedrive.length > 0 && (
        <Card title="既存 Pipedrive (面談FB側) との突合">
          <ul className="text-xs space-y-1">
            {pipedrive.map((m) => (
              <li key={m.id} className="flex items-center gap-3">
                <span className="font-bold">{m.name}</span>
                {m.pipedrive_org_id != null && <span className="text-[10px] text-gray-400">org#{m.pipedrive_org_id}</span>}
                <span className="text-[10px] text-gray-500">won={m.won_deals_count ?? 0} / open={m.open_deals_count ?? 0} / people={m.people_count ?? 0}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-[#afafaf]">同名 (寄せ字含む) の会社が既存テーブルにあれば、過去の打診履歴を参照できます</p>
        </Card>
      )}

      <Card title="マッチ判定（◎ ○ △ ×）">
        {matches.length === 0 ? (
          <p className="text-xs text-gray-500">未判定 — 「候補者マッチ」を実行</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-left text-[10px] uppercase text-gray-500">
              <tr><th>判定</th><th>点数</th><th>求人</th><th>候補者</th><th>理由</th></tr>
            </thead>
            <tbody>
              {matches.map((m) => (
                <tr key={m.match_id} className="border-t border-gray-100">
                  <td className={`py-1 font-black ${m.grade === "◎" ? "text-green-600" : "text-blue-500"}`}>{m.grade}</td>
                  <td className="py-1 tabular-nums">{m.score}</td>
                  <td className="py-1">{m.job_title}</td>
                  <td className="py-1 text-gray-500">{m.candidate_name}</td>
                  <td className="py-1 text-[10px] text-gray-500">{(m.reasons ?? []).slice(0, 2).join(" / ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card title={`活動履歴 (${activities.length})`} right={
        <button onClick={() => setShowActivity(true)} className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-[#1CB0F6] text-white">＋ 活動追加</button>
      }>
        {activities.length === 0 ? (
          <p className="text-xs text-gray-500">未記録</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-xs">
            {activities.map((a) => (
              <li key={a.id} className="py-2">
                <span className="mr-2 px-1.5 py-0.5 rounded bg-gray-100 text-[10px] font-bold">{a.kind}</span>
                {a.channel && <span className="text-[10px] text-gray-400">{a.channel}</span>}
                <span className="ml-2 text-gray-400 text-[10px]">{new Date(a.occurred_at).toLocaleString("ja-JP")}</span>
                {a.body && <div className="mt-1 text-[10px] text-gray-500">{a.body}</div>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {showEdit && (
        <EditCompanyModal
          company={{ id, name: overview.name, category: overview.category, priority: overview.priority, recruit_page_url: overview.recruit_page_url, contact_paths, notes }}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); setReloadKey((k) => k + 1); }}
        />
      )}
      {showActivity && (
        <ActivityModal
          companyId={id}
          onClose={() => setShowActivity(false)}
          onSaved={() => { setShowActivity(false); setReloadKey((k) => k + 1); }}
        />
      )}
    </div>
  );
}

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-black text-[#4b4b4b]">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------

function EditCompanyModal({
  company, onClose, onSaved,
}: {
  company: { id: string; name: string; category: string | null; priority: Priority; recruit_page_url: string | null; contact_paths: ContactPath[]; notes: string | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(company.name);
  const [category, setCategory] = useState(company.category ?? "");
  const [priority, setPriority] = useState<Priority>(company.priority);
  const [recruitUrl, setRecruitUrl] = useState(company.recruit_page_url ?? "");
  const [notes, setNotes] = useState(company.notes ?? "");
  const [paths, setPaths] = useState<ContactPath[]>(company.contact_paths ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function updatePath(i: number, patch: Partial<ContactPath>) {
    setPaths((arr) => arr.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }
  function removePath(i: number) { setPaths((arr) => arr.filter((_, j) => j !== i)); }
  function addPath() { setPaths((arr) => [...arr, { kind: "form", url: "" }]); }

  async function save() {
    setBusy(true); setErr(null);
    try {
      await api.updateCompany({
        id: company.id,
        name, category: category || null, priority,
        recruit_page_url: recruitUrl || null,
        contact_paths: paths.filter((p) => p.url || p.value),
        notes: notes || null,
      });
      onSaved();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Modal title="企業を編集" onClose={onClose} wide>
      <div className="space-y-3 text-xs">
        <Labeled label="企業名"><input value={name} onChange={(e) => setName(e.target.value)} className="rounded border border-gray-200 px-2 py-1 w-full" /></Labeled>
        <div className="grid grid-cols-2 gap-2">
          <Labeled label="カテゴリ">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded border border-gray-200 px-2 py-1 w-full">
              <option value="">未設定</option>
              {["建築設備", "FM", "PM", "施設管理", "ゼネコン", "サブコン", "その他"].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Labeled>
          <Labeled label="優先度">
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className="rounded border border-gray-200 px-2 py-1 w-full">
              {(["S", "A", "B", "C"] as Priority[]).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Labeled>
        </div>
        <Labeled label="採用ページ URL"><input value={recruitUrl} onChange={(e) => setRecruitUrl(e.target.value)} placeholder="https://..." className="rounded border border-gray-200 px-2 py-1 w-full" /></Labeled>

        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="text-[10px] font-bold text-[#afafaf] uppercase">連絡経路 (お問い合わせフォーム / メール / LinkedIn 等)</div>
            <button onClick={addPath} className="text-[10px] font-bold text-[#1CB0F6] hover:underline">＋ 追加</button>
          </div>
          {paths.length === 0 && <p className="text-[10px] text-gray-400">未登録</p>}
          {paths.map((p, i) => (
            <div key={i} className="flex gap-1 mb-1">
              <select value={p.kind} onChange={(e) => updatePath(i, { kind: e.target.value as ContactPath["kind"] })} className="rounded border border-gray-200 px-1 py-1 w-24">
                <option value="form">form</option><option value="email">email</option><option value="linkedin">linkedin</option><option value="phone">phone</option><option value="other">other</option>
              </select>
              <input value={p.url ?? ""} onChange={(e) => updatePath(i, { url: e.target.value })} placeholder="URL / メールアドレス" className="rounded border border-gray-200 px-2 py-1 flex-1" />
              <button onClick={() => removePath(i)} className="px-2 text-gray-400 hover:text-red-500">×</button>
            </div>
          ))}
        </div>

        <Labeled label="メモ"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="rounded border border-gray-200 px-2 py-1 w-full h-16" /></Labeled>

        {err && <div className="text-[10px] text-red-600">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 rounded-lg text-[10px] font-bold border border-gray-200">キャンセル</button>
          <button onClick={save} disabled={busy} className="px-3 py-1 rounded-lg text-[10px] font-black bg-[#58CC02] text-white disabled:opacity-50">
            {busy ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

const ACT_KINDS = ["sent", "replied", "meeting", "closed", "note"] as const;

function ActivityModal({ companyId, onClose, onSaved }: { companyId: string; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<(typeof ACT_KINDS)[number]>("replied");
  const [channel, setChannel] = useState("email");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true); setErr(null);
    try {
      await api.activity({ company_id: companyId, kind, channel, body: body || undefined });
      onSaved();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Modal title="活動を追加" onClose={onClose}>
      <div className="space-y-3 text-xs">
        <Labeled label="種別">
          <select value={kind} onChange={(e) => setKind(e.target.value as (typeof ACT_KINDS)[number])} className="rounded border border-gray-200 px-2 py-1 w-full">
            {ACT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </Labeled>
        <Labeled label="チャンネル">
          <select value={channel} onChange={(e) => setChannel(e.target.value)} className="rounded border border-gray-200 px-2 py-1 w-full">
            {["email", "form", "phone", "linkedin", "manual"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Labeled>
        <Labeled label="メモ / 本文"><textarea value={body} onChange={(e) => setBody(e.target.value)} className="rounded border border-gray-200 px-2 py-1 w-full h-24" /></Labeled>
        {err && <div className="text-[10px] text-red-600">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 rounded-lg text-[10px] font-bold border border-gray-200">キャンセル</button>
          <button onClick={save} disabled={busy} className="px-3 py-1 rounded-lg text-[10px] font-black bg-[#58CC02] text-white disabled:opacity-50">
            {busy ? "保存中…" : "保存"}
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
