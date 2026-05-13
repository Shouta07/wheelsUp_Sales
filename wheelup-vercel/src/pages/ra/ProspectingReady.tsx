import { useEffect, useState } from "react";
import { api, isLive, listReady } from "../../lib/ra/queries";
import type { ReadyRow } from "../../lib/ra/types";
import Modal from "./Modal";

export default function ProspectingReady({
  onOpenCompany,
}: {
  onOpenCompany: (id: string) => void;
}) {
  const [rows, setRows] = useState<ReadyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);
  const [draftFor, setDraftFor] = useState<ReadyRow | null>(null);

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
              <th className="px-3 py-2 text-right">アクション</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400">該当なし</td></tr>
            ) : rows.map((r) => (
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
                <td className="px-3 py-2 text-right">
                  <div className="inline-flex gap-1 items-center">
                    {sent[r.match_id] ? (
                      <span className="text-[10px] text-green-600 font-bold">送信記録済</span>
                    ) : (
                      <>
                        <button
                          onClick={() => setDraftFor(r)}
                          className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-[#CE82FF] text-white hover:bg-purple-500"
                          title="メール下書きを Gemini に作らせる"
                        >
                          ✍️ 下書き
                        </button>
                        <button
                          onClick={() => markSent(r)}
                          className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-[#1CB0F6] text-white hover:bg-[#1899D6]"
                        >
                          送信記録
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {draftFor && (
        <DraftModal
          row={draftFor}
          onClose={() => setDraftFor(null)}
          onSent={() => {
            setSent((s) => ({ ...s, [draftFor.match_id]: true }));
            setDraftFor(null);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// メール下書きモーダル — Gemini で件名+本文を生成、編集可、コピー & 送信記録
// ---------------------------------------------------------------------------
function DraftModal({ row, onClose, onSent }: { row: ReadyRow; onClose: () => void; onSent: () => void }) {
  const [busy, setBusy] = useState(true);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    api.draftEmail(row.match_id)
      .then((d) => { if (alive) { setSubject(d.subject); setBody(d.body); } })
      .catch((e) => { if (alive) setErr((e as Error).message); })
      .finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [row.match_id]);

  async function copyAll() {
    await navigator.clipboard.writeText(`件名: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function recordSent() {
    try {
      await api.activity({
        company_id: row.company_id, job_id: row.job_id, candidate_id: row.candidate_id,
        kind: "sent", channel: "email", body: `件名: ${subject}\n${body}`,
      });
      onSent();
    } catch (e) { setErr((e as Error).message); }
  }

  // mailto: で Gmail を開く。URL 長制限 (Chrome ~2KB) を超えると本文が切れるので警告。
  const contactEmail = row.company_contact_paths.find((p) => p.kind === "email")?.url ?? row.company_contact_paths.find((p) => p.kind === "email")?.value;
  const mailto = `mailto:${contactEmail ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const mailtoTooLong = mailto.length > 1900;   // 安全マージン込み
  const formUrl = row.company_contact_paths.find((p) => p.kind === "form")?.url;

  return (
    <Modal title={`メール下書き: ${row.company_name} / ${row.job_title}`} onClose={onClose} wide>
      <div className="space-y-3 text-xs">
        <div className="rounded-lg bg-[#f7f7f7] p-2 text-[10px] text-gray-600">
          <span className="font-bold">{row.grade}</span> {row.score}点 / {row.candidate_name} → {row.company_name}<br />
          {(row.reasons ?? []).slice(0, 3).join(" / ")}
        </div>

        {busy ? (
          <p className="text-center text-gray-400 py-8">Gemini が下書きを書いています…</p>
        ) : err ? (
          <p className="text-red-600">{err}</p>
        ) : (
          <>
            <Labeled label="件名">
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className="rounded border border-gray-200 px-2 py-1 w-full" />
            </Labeled>
            <Labeled label="本文">
              <textarea value={body} onChange={(e) => setBody(e.target.value)} className="rounded border border-gray-200 px-2 py-2 w-full h-48 font-mono text-[11px] leading-relaxed" />
            </Labeled>

            <div className="rounded-lg bg-blue-50 text-blue-800 text-[10px] p-2">
              💡 編集してから「Gmail で開く」or「フォーム URL を開く」or「コピー」して送信 → 「送信記録」を押す
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <button onClick={copyAll} className="px-3 py-1 rounded-lg text-[10px] font-black border border-gray-200 hover:bg-gray-50">
                {copied ? "コピー済✓" : "📋 コピー"}
              </button>
              {contactEmail && (
                <a
                  href={mailtoTooLong ? `mailto:${contactEmail}?subject=${encodeURIComponent(subject)}` : mailto}
                  target="_blank" rel="noreferrer"
                  title={mailtoTooLong ? "本文が長すぎるので件名のみで開きます。本文は📋コピーで貼ってください" : ""}
                  className="px-3 py-1 rounded-lg text-[10px] font-black bg-white border border-gray-200 hover:bg-gray-50"
                >
                  📧 Gmail で開く{mailtoTooLong ? " ⚠" : ""}
                </a>
              )}
              {formUrl && (
                <a href={formUrl} target="_blank" rel="noreferrer" className="px-3 py-1 rounded-lg text-[10px] font-black bg-white border border-gray-200 hover:bg-gray-50">
                  📝 フォームを開く
                </a>
              )}
              <button onClick={recordSent} className="px-3 py-1 rounded-lg text-[10px] font-black bg-[#58CC02] text-white hover:bg-[#46a302]">
                ✓ 送信記録
              </button>
            </div>
          </>
        )}
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
