import { useEffect, useMemo, useState } from "react";
import { isLive, listCompaniesEnriched, listReady, APPROACH_STATUSES } from "../../lib/ra/queries";
import type { ApproachStatus, CompanyEnriched } from "../../lib/ra/queries";
import type { ReadyRow, Priority } from "../../lib/ra/types";
import { supabase } from "../../lib/supabase";
import SendModal from "./SendModal";
import { LoadError } from "./RaErrorBoundary";

/**
 * RA トップ画面 — タブ切替なしで「全部 1 画面で完結」する統合ダッシュボード。
 *
 * セクション (上から):
 *   1. 進捗タイル (5 つ、コンパクト)
 *   2. ⏰ フォロー対象 (3 日経過後 sent でその後反応なし)
 *   3. 🎯 今日のアタック対象 (◎○ × 未送信、送信処理ボタン)
 *   4. 📋 企業一覧 (246 社、フィルタ + アプローチ状況)
 *
 * 5/19 ユーザー要望:
 *   - KPI 削除
 *   - エラー表示を控えめに
 *   - 全部 1 画面で見たい (タブ切替なし)
 */

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

export default function ProspectingHome({
  onOpenCompany,
}: {
  onOpenCompany: (id: string) => void;
}) {
  const [companies, setCompanies] = useState<CompanyEnriched[]>([]);
  const [ready, setReady] = useState<ReadyRow[]>([]);
  const [follows, setFollows] = useState<FollowUpRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [openSend, setOpenSend] = useState<ReadyRow | null>(null);
  const [sentLocal, setSentLocal] = useState<Record<string, boolean>>({});
  const [statusFilter, setStatusFilter] = useState<"" | ApproachStatus>("");
  const [q, setQ] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"" | Priority>("");
  const [candidateFilter, setCandidateFilter] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    (async () => {
      try {
        const [co, rd, fu] = await Promise.all([
          listCompaniesEnriched(),
          listReady(200),
          listFollowUps(),
        ]);
        if (!alive) return;
        setCompanies(co);
        setReady(rd);
        setFollows(fu);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e : new Error(String(e)));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [reloadKey]);

  // 進捗タイルの集計
  const stats = useMemo(() => ({
    total: companies.length,
    withUrl: companies.filter((c) => c.recruit_page_url).length,
    crawled: companies.filter((c) => c.last_crawled_at).length,
    openJobs: companies.reduce((s, c) => s + (c.open_jobs ?? 0), 0),
    strong: companies.reduce((s, c) => s + (c.strong_matches ?? 0), 0),
    untouched: companies.filter((c) => c.approach_status === "untouched").length,
  }), [companies]);

  // 企業フィルタ
  const filteredCompanies = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return companies.filter((c) => {
      if (ql && !c.name.toLowerCase().includes(ql)) return false;
      if (priorityFilter && c.priority !== priorityFilter) return false;
      if (statusFilter && c.approach_status !== statusFilter) return false;
      return true;
    });
  }, [companies, q, priorityFilter, statusFilter]);

  // ステータス別カウント
  const statusCounts = useMemo(() => {
    const c: Record<ApproachStatus, number> = { untouched: 0, sent: 0, replied: 0, meeting: 0, closed: 0 };
    for (const co of companies) c[co.approach_status] = (c[co.approach_status] ?? 0) + 1;
    return c;
  }, [companies]);

  // 候補者一覧 (ready 行から distinct) — 候補者ごとの絞り込み用
  const candidateNames = useMemo(() => {
    const s = new Set<string>();
    for (const r of ready) if (r.candidate_name) s.add(r.candidate_name);
    return Array.from(s).sort();
  }, [ready]);

  // ready のフィルタ (候補者) + ソート (◎ → ○ → △、スコア降順)
  const sortedReady = useMemo(() => {
    const filtered = candidateFilter
      ? ready.filter((r) => r.candidate_name === candidateFilter)
      : ready;
    return [...filtered].sort((a, b) => {
      const gw = (g: string) => g === "◎" ? 0 : g === "○" ? 1 : 2;
      if (gw(a.grade) !== gw(b.grade)) return gw(a.grade) - gw(b.grade);
      return (b.score ?? 0) - (a.score ?? 0);
    });
  }, [ready, candidateFilter]);

  if (loading) return <div className="text-sm text-gray-500">読み込み中…</div>;
  if (error) return <LoadError error={error} onRetry={() => setReloadKey((k) => k + 1)} />;

  return (
    <div className="space-y-4">
      {/* ─── 1. 進捗ファネル (パイプラインを視覚化) ───────── */}
      <section className="rounded-xl border border-gray-200 bg-white shadow-sm p-3">
        <div className="text-[10px] font-extrabold text-[#777] uppercase tracking-wider mb-2">📊 開拓パイプライン</div>
        <FunnelBar
          steps={[
            { label: "企業", value: stats.total, color: "#6b7280" },
            { label: "URL補完", value: stats.withUrl, color: "#1CB0F6" },
            { label: "求人公開", value: stats.openJobs, color: "#CE82FF" },
            { label: "◎○マッチ", value: stats.strong, color: "#58CC02" },
            { label: "送信可能", value: ready.length, color: "#FF9600" },
          ]}
        />
        {stats.untouched > 0 && (
          <div className="mt-2 text-[10px] text-amber-700 bg-amber-50 rounded-md px-2 py-1 inline-block">
            🎯 未接触: <span className="font-extrabold">{stats.untouched}</span> 社
          </div>
        )}
      </section>

      {/* ─── 2. ⏰ フォロー対象 ─────────────────────── */}
      {follows.length > 0 && (
        <section className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">⏰</span>
            <span className="font-black text-amber-900 text-sm">フォロー対象 ({follows.length} 件)</span>
            <span className="text-[10px] text-amber-700">3 日以上前に送信、その後反応なし</span>
          </div>
          <ul className="space-y-1">
            {follows.slice(0, 5).map((f, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className="text-[10px] font-bold text-amber-700 tabular-nums w-12">{f.days_since}日前</span>
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
        </section>
      )}

      {/* ─── 3. 🎯 今日のアタック対象 ─────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-2 justify-between">
          <span className="text-xs font-black text-[#4b4b4b]">
            🎯 今日のアタック対象 ({sortedReady.length} 件)
          </span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-[10px] font-bold text-[#777]">
              候補者で絞る
              <select
                value={candidateFilter}
                onChange={(e) => setCandidateFilter(e.target.value)}
                className="rounded-lg border border-gray-200 px-2 py-1 text-[11px]"
              >
                <option value="">全候補者</option>
                {candidateNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <span className="text-[10px] text-[#afafaf]">◎ → ○ → △ 優先順</span>
          </div>
        </div>
        {sortedReady.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-gray-400">
            {!isLive ? (
              <>モックモード — 🤖 URL補完 → 🕸 クロール → 🎯 マッチ を回すと並びます</>
            ) : (
              <>該当なし。求人クロール → 候補者マッチを実行してください</>
            )}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-left text-[10px] uppercase text-gray-500">
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
              {sortedReady.slice(0, 50).map((r) => (
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
                    {r.job_url ? <a href={r.job_url} target="_blank" rel="noreferrer" className="hover:underline">{r.job_title}</a> : r.job_title}
                  </td>
                  <td className="px-3 py-1.5 text-gray-500">{r.candidate_name}</td>
                  <td className="px-3 py-1.5 max-w-[260px] text-[10px] text-gray-600 truncate" title={(r.reasons ?? []).join(" / ")}>
                    {(r.reasons ?? []).slice(0, 2).join(" / ")}
                  </td>
                  <td className="px-3 py-1.5 text-right">
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
        )}
        {sortedReady.length > 50 && (
          <div className="px-3 py-2 text-[10px] text-center text-[#afafaf] border-t border-gray-100">
            {sortedReady.length - 50} 件を非表示中
          </div>
        )}
      </section>

      {/* ─── 4. 📋 企業一覧 ──────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black text-[#4b4b4b]">
              📋 企業一覧 ({filteredCompanies.length} / {companies.length} 件)
            </span>
          </div>

          {/* フィルタ行 */}
          <div className="flex flex-wrap gap-2 items-center">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="企業名で絞り込み"
              className="rounded-lg border border-gray-200 px-2 py-1 text-xs w-40"
            />
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as "" | Priority)}
              className="rounded-lg border border-gray-200 px-2 py-1 text-xs"
            >
              <option value="">優先度すべて</option>
              <option value="S">S</option><option value="A">A</option><option value="B">B</option><option value="C">C</option>
            </select>
            <div className="flex gap-1 ml-1">
              <FilterChip active={statusFilter === ""} onClick={() => setStatusFilter("")} label="すべて" count={companies.length} />
              {APPROACH_STATUSES.map((s) => (
                <FilterChip
                  key={s.key}
                  active={statusFilter === s.key}
                  onClick={() => setStatusFilter(statusFilter === s.key ? "" : s.key)}
                  label={s.label}
                  count={statusCounts[s.key] ?? 0}
                />
              ))}
            </div>
          </div>
        </div>

        <table className="w-full text-xs">
          <thead className="bg-gray-50 text-left text-[10px] uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">企業</th>
              <th className="px-3 py-2">状況</th>
              <th className="px-3 py-2 text-right">求人/◎○</th>
              <th className="px-3 py-2">送信先</th>
            </tr>
          </thead>
          <tbody>
            {filteredCompanies.slice(0, 100).map((c) => {
              const form = c.contact_paths.find((p) => p.kind === "form");
              const email = c.contact_paths.find((p) => p.kind === "email");
              const statusDef = APPROACH_STATUSES.find((s) => s.key === c.approach_status)!;
              const counts = c.activity_counts;
              const hasActivity = (counts.sent ?? 0) + (counts.replied ?? 0) + (counts.meeting ?? 0) > 0;
              return (
                <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50/40">
                  {/* 企業 (優先度バッジ + カテゴリ) */}
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                        c.priority === "S" ? "bg-amber-100 text-amber-700" :
                        c.priority === "A" ? "bg-blue-100 text-blue-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>{c.priority}</span>
                      <button onClick={() => onOpenCompany(c.id)} className="font-bold text-[#4b4b4b] hover:underline truncate">
                        {c.name}
                      </button>
                    </div>
                    {c.category && (
                      <div className="text-[10px] text-gray-400 ml-7 truncate">{c.category}</div>
                    )}
                  </td>

                  {/* 状況 (アプローチ + アクティビティ集約) */}
                  <td className="px-3 py-2">
                    <div className={`text-[10px] font-bold ${statusDef.color}`}>● {statusDef.label}</div>
                    {hasActivity && (
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {(counts.sent ?? 0) > 0 && `送${counts.sent} `}
                        {(counts.replied ?? 0) > 0 && `返${counts.replied} `}
                        {(counts.meeting ?? 0) > 0 && `商${counts.meeting} `}
                        {c.last_activity_at && `· ${formatAgo(c.last_activity_at)}`}
                      </div>
                    )}
                  </td>

                  {/* 求人/◎○ */}
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className="text-[#4b4b4b]">{c.open_jobs}</span>
                    {c.strong_matches > 0 && (
                      <span className="ml-1 text-green-600 font-bold">◎{c.strong_matches}</span>
                    )}
                  </td>

                  {/* 送信先 */}
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {form && (
                        <a href={form.url} target="_blank" rel="noreferrer" title="お問い合わせフォーム"
                          className="px-2 py-0.5 rounded-full bg-[#1CB0F6] text-white text-[10px] font-bold">📝 フォーム</a>
                      )}
                      {email && (
                        <a href={email.url ?? `mailto:${email.value}`} target="_blank" rel="noreferrer" title={email.value ?? ""}
                          className="px-2 py-0.5 rounded-full bg-[#58CC02] text-white text-[10px] font-bold">✉ メール</a>
                      )}
                      {!form && !email && c.recruit_page_url && (
                        <a href={c.recruit_page_url} target="_blank" rel="noreferrer"
                          className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-bold hover:bg-gray-200">採用ページ</a>
                      )}
                      {!form && !email && !c.recruit_page_url && (
                        <span className="text-[10px] text-gray-300">未取得</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filteredCompanies.length > 100 && (
          <div className="px-3 py-2 text-[10px] text-center text-[#afafaf] border-t border-gray-100">
            {filteredCompanies.length - 100} 件を非表示中 — フィルタで絞り込んでください
          </div>
        )}
      </section>

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

// ─── ヘルパ ──────────────────────────────────────────────

// 開拓パイプラインの進捗を 1 本のバーで視覚化。各ステップが前ステップの何 % か分かる。
function FunnelBar({ steps }: { steps: { label: string; value: number; color: string }[] }) {
  const maxValue = Math.max(...steps.map((s) => s.value), 1);
  return (
    <div className="space-y-1.5">
      {steps.map((s, i) => {
        const pct = (s.value / maxValue) * 100;
        const prevValue = i > 0 ? steps[i - 1].value : null;
        const conversionPct = prevValue && prevValue > 0 ? ((s.value / prevValue) * 100).toFixed(0) : null;
        return (
          <div key={s.label} className="flex items-center gap-2">
            <div className="w-20 shrink-0 text-[10px] font-extrabold text-[#4b4b4b]">{s.label}</div>
            <div className="flex-1 relative h-5 bg-gray-100 rounded overflow-hidden">
              <div
                className="h-full transition-all flex items-center justify-end px-2"
                style={{ width: `${Math.max(pct, 8)}%`, backgroundColor: s.color }}
              >
                <span className="text-[10px] font-extrabold text-white tabular-nums">{s.value}</span>
              </div>
            </div>
            {conversionPct !== null && (
              <div className="w-12 shrink-0 text-right text-[9px] font-bold text-[#aaa] tabular-nums">
                {conversionPct}%
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FilterChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`px-2 py-1 rounded-full text-[10px] font-bold ${
        active ? "bg-[#1CB0F6] text-white" : "bg-white border border-[#e5e5e5] text-[#4b4b4b] hover:bg-gray-50"
      }`}
    >
      {label} {count}
    </button>
  );
}

function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "数秒前";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}時間前`;
  if (diff < 86_400_000 * 30) return `${Math.floor(diff / 86_400_000)}日前`;
  return new Date(iso).toLocaleDateString("ja-JP");
}

async function listFollowUps(): Promise<FollowUpRow[]> {
  if (!isLive) return [];
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: acts } = await supabase
    .from("ra_activities")
    .select("company_id,job_id,candidate_id,kind,occurred_at")
    .gte("occurred_at", cutoff)
    .order("occurred_at", { ascending: false })
    .limit(2000);
  if (!acts) return [];

  type Key = string;
  const latestByKey = new Map<Key, { kind: string; occurred_at: string }>();
  for (const a of acts as Array<{ company_id: string | null; job_id: string | null; candidate_id: string | null; kind: string; occurred_at: string }>) {
    const k = `${a.company_id ?? ""}|${a.job_id ?? ""}|${a.candidate_id ?? ""}`;
    if (!latestByKey.has(k)) latestByKey.set(k, { kind: a.kind, occurred_at: a.occurred_at });
  }

  const threshold = 3 * 24 * 60 * 60 * 1000;
  const followKeys: { company_id: string; job_id: string | null; candidate_id: string | null; occurred_at: string; days: number }[] = [];
  for (const [k, v] of latestByKey) {
    if (v.kind !== "sent") continue;
    const [companyId, jobId, candId] = k.split("|");
    const age = Date.now() - new Date(v.occurred_at).getTime();
    if (age >= threshold && companyId) {
      followKeys.push({ company_id: companyId, job_id: jobId || null, candidate_id: candId || null, occurred_at: v.occurred_at, days: Math.floor(age / (24 * 60 * 60 * 1000)) });
    }
  }

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
    .sort((a, b) => b.days_since - a.days_since);
}
