import { useEffect, useMemo, useState } from "react";
import { isLive, listReady } from "../../lib/ra/queries";
import { supabase } from "../../lib/supabase";
import type { ReadyRow } from "../../lib/ra/types";
import SendModal from "./SendModal";

type FollowUpRow = {
  company_id: string;
  job_id: string | null;
  candidate_id: string | null;
  company_name: string;
  job_title: string | null;
  candidate_name: string | null;
  occurred_at: string;
  days_since: number;
};

/**
 * 実行待ち画面 — 朝の中心。
 *
 * 上段: フォロー漏れ警告 (3 日以上前に sent、その後 replied/meeting なし)
 * 下段: ◎○ かつ未送信のリスト
 *
 * 1 件あたり「送信」ボタン押下 → SendModal がテンプレ生成 → 1 アクションでコピー&送信記録
 */
export default function ProspectingReady({
  onOpenCompany,
}: {
  onOpenCompany: (id: string) => void;
}) {
  const [rows, setRows] = useState<ReadyRow[]>([]);
  const [follows, setFollows] = useState<FollowUpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sentLocal, setSentLocal] = useState<Record<string, boolean>>({});
  const [openSend, setOpenSend] = useState<ReadyRow | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [ready, fu] = await Promise.all([listReady(500), listFollowUps()]);
        if (!alive) return;
        setRows(ready);
        setFollows(fu);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [reloadKey]);

  // ◎ → ○ → △ の優先順、点数降順
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const gw = (g: string) => g === "◎" ? 0 : g === "○" ? 1 : 2;
      if (gw(a.grade) !== gw(b.grade)) return gw(a.grade) - gw(b.grade);
      return (b.score ?? 0) - (a.score ?? 0);
    });
  }, [rows]);

  if (loading) return <div className="text-sm text-gray-500">読み込み中…</div>;

  return (
    <div className="space-y-3">
      {!isLive && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs p-3">
          モックモード — 🕸 求人クロール → 🎯 候補者マッチ を回すとここに ◎○ が並びます。
        </div>
      )}

      {/* ─── フォロー漏れ警告 ─────────────────────────── */}
      {follows.length > 0 && (
        <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">⏰</span>
            <span className="font-black text-amber-900 text-sm">フォロー対象 ({follows.length} 件)</span>
            <span className="text-[10px] text-amber-700">3 日以上前に送信、返信なし</span>
          </div>
          <ul className="space-y-1">
            {follows.slice(0, 5).map((f, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className="text-[10px] font-bold text-amber-700 tabular-nums">{f.days_since}日前</span>
                <button onClick={() => onOpenCompany(f.company_id)} className="font-bold text-[#4b4b4b] hover:underline">
                  {f.company_name}
                </button>
                <span className="text-gray-500 truncate flex-1">
                  {f.candidate_name ? `${f.candidate_name} → ${f.job_title ?? ""}` : f.job_title}
                </span>
              </li>
            ))}
            {follows.length > 5 && (
              <li className="text-[10px] text-amber-700">…他 {follows.length - 5} 件</li>
            )}
          </ul>
        </div>
      )}

      {/* ─── 実行待ち本体 ──────────────────────────── */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <span className="text-xs font-black text-[#4b4b4b]">
            🎯 今日のアタック対象 ({sorted.length} 件)
          </span>
          <span className="text-[10px] text-[#afafaf]">◎ → ○ → △ の優先順</span>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-left text-[10px] uppercase text-gray-500">
            <tr>
              <th className="px-3 py-1.5">判定</th>
              <th className="px-3 py-1.5">点数</th>
              <th className="px-3 py-1.5">企業</th>
              <th className="px-3 py-1.5">求人</th>
              <th className="px-3 py-1.5">候補者</th>
              <th className="px-3 py-1.5">理由 (抜粋)</th>
              <th className="px-3 py-1.5 text-right">アクション</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                  該当なし — 🕸 クロール → 🎯 マッチ を実行すると並びます
                </td>
              </tr>
            ) : sorted.map((r) => (
              <tr key={r.match_id} className="border-t border-gray-100 hover:bg-gray-50/50">
                <td className={`px-3 py-1.5 font-black ${r.grade === "◎" ? "text-green-600" : r.grade === "○" ? "text-blue-500" : "text-gray-500"}`}>
                  {r.grade}
                </td>
                <td className="px-3 py-1.5 tabular-nums">{r.score}</td>
                <td className="px-3 py-1.5">
                  <button onClick={() => onOpenCompany(r.company_id)} className="font-bold text-[#4b4b4b] hover:underline">
                    {r.company_name}
                  </button>
                  <span className="ml-1.5 inline-flex items-center rounded-full bg-gray-100 px-1.5 text-[9px] text-gray-500">
                    {r.company_priority}
                  </span>
                </td>
                <td className="px-3 py-1.5 max-w-[180px] truncate" title={r.job_title}>
                  {r.job_url ? (
                    <a href={r.job_url} target="_blank" rel="noreferrer" className="hover:underline">
                      {r.job_title}
                    </a>
                  ) : r.job_title}
                </td>
                <td className="px-3 py-1.5 text-gray-500">{r.candidate_name}</td>
                <td className="px-3 py-1.5 max-w-[260px] text-[10px] text-gray-600 truncate" title={(r.reasons ?? []).join(" / ")}>
                  {(r.reasons ?? []).slice(0, 2).join(" / ")}
                </td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap">
                  {sentLocal[r.match_id] ? (
                    <span className="text-[10px] text-green-600 font-bold">✓ 送信記録済</span>
                  ) : (
                    <button
                      onClick={() => setOpenSend(r)}
                      className="px-2.5 py-1 rounded-lg text-[10px] font-black bg-[#58CC02] text-white hover:bg-[#46a302]"
                      style={{ borderBottom: "2px solid #46a302" }}
                    >
                      ✉️ 送信処理
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[10px] text-[#afafaf]">
        💡 「✉️ 送信処理」 ボタンでテンプレ + コピー + 送信先起動 + 送信記録 が 1 クリックで完結
      </p>

      {openSend && (
        <SendModal
          row={openSend}
          onClose={() => setOpenSend(null)}
          onSent={() => {
            setSentLocal((s) => ({ ...s, [openSend.match_id]: true }));
            setOpenSend(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// フォロー漏れ判定: 3 日以上前に sent、その後 replied/meeting/closed が無い
// ---------------------------------------------------------------------------
async function listFollowUps(): Promise<FollowUpRow[]> {
  if (!isLive) return [];

  // 過去 30 日の sent をすべて取得
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: acts } = await supabase
    .from("ra_activities")
    .select("company_id,job_id,candidate_id,kind,occurred_at")
    .gte("occurred_at", cutoff)
    .order("occurred_at", { ascending: false })
    .limit(2000);
  if (!acts) return [];

  // (company_id, job_id, candidate_id) の組合せでまとめる
  type Key = string;
  const latestByKey = new Map<Key, { kind: string; occurred_at: string }>();
  for (const a of acts as Array<{ company_id: string | null; job_id: string | null; candidate_id: string | null; kind: string; occurred_at: string }>) {
    const k = `${a.company_id ?? ""}|${a.job_id ?? ""}|${a.candidate_id ?? ""}`;
    if (!latestByKey.has(k)) latestByKey.set(k, { kind: a.kind, occurred_at: a.occurred_at });
  }

  // sent が最後の活動かつ 3 日以上経過しているものを抽出
  const threshold = 3 * 24 * 60 * 60 * 1000;
  const followKeys: { company_id: string; job_id: string | null; candidate_id: string | null; occurred_at: string; days: number }[] = [];
  for (const [k, v] of latestByKey) {
    if (v.kind !== "sent") continue;
    const [companyId, jobId, candId] = k.split("|");
    const age = Date.now() - new Date(v.occurred_at).getTime();
    if (age >= threshold && companyId) {
      followKeys.push({
        company_id: companyId,
        job_id: jobId || null,
        candidate_id: candId || null,
        occurred_at: v.occurred_at,
        days: Math.floor(age / (24 * 60 * 60 * 1000)),
      });
    }
  }

  // 詳細を埋める (会社名 / 求人タイトル / 候補者名)
  const companyIds = Array.from(new Set(followKeys.map((f) => f.company_id)));
  const jobIds = Array.from(new Set(followKeys.map((f) => f.job_id).filter(Boolean) as string[]));
  const candIds = Array.from(new Set(followKeys.map((f) => f.candidate_id).filter(Boolean) as string[]));

  const [companiesRes, jobsRes, candsRes] = await Promise.all([
    companyIds.length > 0 ? supabase.from("ra_companies").select("id,name").in("id", companyIds) : Promise.resolve({ data: [] }),
    jobIds.length     > 0 ? supabase.from("ra_jobs").select("id,title").in("id", jobIds)         : Promise.resolve({ data: [] }),
    candIds.length    > 0 ? supabase.from("ra_candidates").select("id,name").in("id", candIds)    : Promise.resolve({ data: [] }),
  ]);
  const compById = new Map((companiesRes.data ?? []).map((r: { id: string; name: string }) => [r.id, r.name]));
  const jobById  = new Map((jobsRes.data ?? []).map((r: { id: string; title: string }) => [r.id, r.title]));
  const candById = new Map((candsRes.data ?? []).map((r: { id: string; name: string }) => [r.id, r.name]));

  return followKeys
    .map((f) => ({
      company_id: f.company_id,
      job_id: f.job_id,
      candidate_id: f.candidate_id,
      company_name: compById.get(f.company_id) ?? "(unknown)",
      job_title: f.job_id ? (jobById.get(f.job_id) ?? null) : null,
      candidate_name: f.candidate_id ? (candById.get(f.candidate_id) ?? null) : null,
      occurred_at: f.occurred_at,
      days_since: f.days,
    }))
    .sort((a, b) => b.days_since - a.days_since); // 古い順
}
