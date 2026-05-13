import { useEffect, useState } from "react";
import { api, listCandidates } from "../../lib/ra/queries";
import type { Candidate, CandidateProfile } from "../../lib/ra/types";
import Modal from "./Modal";

const ARRAY_FIELDS: Array<{ key: keyof CandidateProfile; label: string; placeholder: string }> = [
  { key: "specialties",        label: "specialties",        placeholder: "例: ファシリティマネジメント" },
  { key: "industries_ok",      label: "industries_ok",      placeholder: "例: FM" },
  { key: "industries_ng",      label: "industries_ng",      placeholder: "例: 戸建分譲" },
  { key: "deal_breakers",      label: "deal_breakers",      placeholder: "例: 夜勤主体のシフト" },
  { key: "in_progress",        label: "in_progress",        placeholder: "例: 三井不動産系 一次面接通過" },
  { key: "preferred_location", label: "preferred_location", placeholder: "例: 東京23区" },
];

export default function ProspectingCandidates() {
  const [list, setList] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    listCandidates().then((d) => { if (alive) setList(d); }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [reloadKey]);

  if (loading) return <div className="text-sm text-gray-500">読み込み中…</div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-[#afafaf]">{list.length} 名</span>
        <button
          onClick={() => setShowAdd(true)}
          className="px-2.5 py-1 rounded-xl text-[10px] font-black bg-[#58CC02] text-white hover:bg-[#46a302]"
        >
          ＋ 候補者追加
        </button>
      </div>

      {list.map((c) => (
        <CandidateCard key={c.id} candidate={c} onSaved={() => setReloadKey((k) => k + 1)} />
      ))}
      <p className="text-[10px] text-[#afafaf]">
        in_progress (進行中案件) を最新化しておくと、deal_breakers と合わせて Gemini が重複アプローチを避けます
      </p>

      {showAdd && (
        <AddCandidateModal
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); setReloadKey((k) => k + 1); }}
        />
      )}
    </div>
  );
}

function AddCandidateModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [headline, setHeadline] = useState("");
  const [specialties, setSpecialties] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!code.trim() || !name.trim()) { setErr("code と name は必須"); return; }
    setBusy(true); setErr(null);
    try {
      await api.addCandidate({
        code: code.trim(),
        name: name.trim(),
        headline: headline.trim() || undefined,
        profile: specialties.trim()
          ? { specialties: specialties.split(",").map((s) => s.trim()).filter(Boolean) }
          : {},
        is_active: true,
      });
      onAdded();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <Modal title="候補者を追加" onClose={onClose}>
      <div className="space-y-3 text-xs">
        <label className="block">
          <div className="text-[10px] font-bold text-[#afafaf] uppercase mb-0.5">code (必須・英数小文字)</div>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="例: tanaka" className="rounded border border-gray-200 px-2 py-1 w-full" />
        </label>
        <label className="block">
          <div className="text-[10px] font-bold text-[#afafaf] uppercase mb-0.5">氏名 (必須)</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 田中" className="rounded border border-gray-200 px-2 py-1 w-full" />
        </label>
        <label className="block">
          <div className="text-[10px] font-bold text-[#afafaf] uppercase mb-0.5">ヘッドライン (任意)</div>
          <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="例: ゼネコン施工管理 12年" className="rounded border border-gray-200 px-2 py-1 w-full" />
        </label>
        <label className="block">
          <div className="text-[10px] font-bold text-[#afafaf] uppercase mb-0.5">specialties (カンマ区切り・任意)</div>
          <input value={specialties} onChange={(e) => setSpecialties(e.target.value)} placeholder="例: 建築施工管理, データセンター, 物流施設" className="rounded border border-gray-200 px-2 py-1 w-full" />
        </label>
        <p className="text-[10px] text-[#afafaf]">作成後、カードの「✎ 編集」で deal_breakers / in_progress / industries_ok などを追加できます</p>

        {err && <div className="text-[10px] text-red-600">{err}</div>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1 rounded-lg text-[10px] font-bold border border-gray-200">キャンセル</button>
          <button onClick={save} disabled={busy} className="px-3 py-1 rounded-lg text-[10px] font-black bg-[#58CC02] text-white disabled:opacity-50">
            {busy ? "追加中…" : "追加"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function CandidateCard({ candidate, onSaved }: { candidate: Candidate; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [headline, setHeadline] = useState(candidate.headline ?? "");
  const [profile, setProfile] = useState<CandidateProfile>(candidate.profile);
  const [active, setActive] = useState(candidate.is_active);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setHeadline(candidate.headline ?? "");
    setProfile(candidate.profile);
    setActive(candidate.is_active);
    setErr(null);
  }

  async function save() {
    setBusy(true); setErr(null);
    try {
      await api.updateCandidate({
        id: candidate.id, headline: headline || null, profile, is_active: active,
      });
      setEditing(false);
      onSaved();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  function updateArray(key: keyof CandidateProfile, idx: number, value: string) {
    const arr = [...((profile[key] as string[] | undefined) ?? [])];
    arr[idx] = value;
    setProfile({ ...profile, [key]: arr });
  }
  function addArray(key: keyof CandidateProfile) {
    const arr = [...((profile[key] as string[] | undefined) ?? []), ""];
    setProfile({ ...profile, [key]: arr });
  }
  function removeArray(key: keyof CandidateProfile, idx: number) {
    const arr = ((profile[key] as string[] | undefined) ?? []).filter((_, i) => i !== idx);
    setProfile({ ...profile, [key]: arr });
  }

  return (
    <div className={`rounded-xl border bg-white p-4 ${active ? "border-gray-200" : "border-gray-300 bg-gray-50 opacity-70"}`}>
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-3">
          <h3 className="text-sm font-black text-[#4b4b4b]">{candidate.name}</h3>
          <span className="text-[10px] font-bold text-[#afafaf]">{candidate.code}</span>
          {!active && <span className="text-[10px] font-bold text-gray-500">(非アクティブ)</span>}
        </div>
        <div className="flex gap-1.5">
          {editing ? (
            <>
              <button onClick={() => { reset(); setEditing(false); }} className="px-2 py-0.5 rounded-lg text-[10px] font-bold border border-gray-200">キャンセル</button>
              <button onClick={save} disabled={busy} className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-[#58CC02] text-white disabled:opacity-50">
                {busy ? "保存中…" : "保存"}
              </button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-white border border-gray-200 hover:bg-gray-50">
              ✎ 編集
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-2 space-y-3 text-xs">
          <label className="block">
            <div className="text-[10px] font-bold text-[#afafaf] uppercase mb-0.5">ヘッドライン</div>
            <input value={headline} onChange={(e) => setHeadline(e.target.value)} className="rounded border border-gray-200 px-2 py-1 w-full" />
          </label>

          {ARRAY_FIELDS.map((f) => {
            const arr = (profile[f.key] as string[] | undefined) ?? [];
            return (
              <div key={f.key}>
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] font-bold text-[#afafaf] uppercase">{f.label}</div>
                  <button onClick={() => addArray(f.key)} className="text-[10px] font-bold text-[#1CB0F6] hover:underline">＋ 追加</button>
                </div>
                {arr.length === 0 && <p className="text-[10px] text-gray-400">未登録</p>}
                {arr.map((v, i) => (
                  <div key={i} className="flex gap-1 mb-1">
                    <input value={v} onChange={(e) => updateArray(f.key, i, e.target.value)} placeholder={f.placeholder} className="rounded border border-gray-200 px-2 py-1 flex-1" />
                    <button onClick={() => removeArray(f.key, i)} className="px-2 text-gray-400 hover:text-red-500">×</button>
                  </div>
                ))}
              </div>
            );
          })}

          <label className="block">
            <div className="text-[10px] font-bold text-[#afafaf] uppercase mb-0.5">desired_salary</div>
            <input value={profile.desired_salary ?? ""} onChange={(e) => setProfile({ ...profile, desired_salary: e.target.value })} placeholder="例: 750-900万円" className="rounded border border-gray-200 px-2 py-1 w-full" />
          </label>
          <label className="block">
            <div className="text-[10px] font-bold text-[#afafaf] uppercase mb-0.5">メモ</div>
            <textarea value={profile.notes ?? ""} onChange={(e) => setProfile({ ...profile, notes: e.target.value })} className="rounded border border-gray-200 px-2 py-1 w-full h-16" />
          </label>
          <label className="flex items-center gap-2 text-[10px]">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            <span className="font-bold">アクティブ (マッチング対象)</span>
          </label>

          {err && <p className="text-[10px] text-red-600">{err}</p>}
        </div>
      ) : (
        <div className="mt-1">
          {candidate.headline && <p className="text-xs text-gray-500">{candidate.headline}</p>}
          <div className="mt-2 grid gap-2 md:grid-cols-2 text-xs">
            {ARRAY_FIELDS.map((f) => {
              const items = candidate.profile[f.key] as string[] | undefined;
              if (!items || items.length === 0) return null;
              return (
                <div key={f.key}>
                  <div className="text-[10px] font-bold text-[#afafaf] uppercase">{f.label}</div>
                  <ul className="mt-0.5 text-xs text-[#4b4b4b]">
                    {items.map((s, i) => <li key={i}>• {s}</li>)}
                  </ul>
                </div>
              );
            })}
            {candidate.profile.desired_salary && (
              <div>
                <div className="text-[10px] font-bold text-[#afafaf] uppercase">desired_salary</div>
                <div className="text-xs text-[#4b4b4b]">{candidate.profile.desired_salary}</div>
              </div>
            )}
            {candidate.profile.notes && (
              <div className="md:col-span-2">
                <div className="text-[10px] font-bold text-[#afafaf] uppercase">メモ</div>
                <div className="text-xs text-gray-500">{candidate.profile.notes}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
