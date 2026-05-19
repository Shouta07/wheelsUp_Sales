import { useEffect, useMemo, useState } from "react";
import {
  isLive, listCompaniesEnriched, listReady, listCompanyCandidateMatches, APPROACH_STATUSES,
} from "../../lib/ra/queries";
import type { ApproachStatus, CompanyEnriched, CandidateMatchCell } from "../../lib/ra/queries";
import type { Grade, Priority } from "../../lib/ra/types";
import { supabase } from "../../lib/supabase";

/**
 * RA トップ画面 — ホームタブの中身。
 *
 * セクション (上から):
 *   1. 📊 開拓パイプライン (ファネル可視化)
 *   2. ⏰ フォロー対象 (3 日経過後 sent でその後反応なし)
 *   3. 📋 企業一覧 (246 社、フィルタ + アプローチ状況)
 *
 * 「今日のアタック対象」は別タブ (募集ポジション) と機能重複のため削除。
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
  const [readyCount, setReadyCount] = useState(0);
  const [follows, setFollows] = useState<FollowUpRow[]>([]);
  const [candidates, setCandidates] = useState<{ id: string; code: string; name: string }[]>([]);
  const [matchesByCompany, setMatchesByCompany] = useState<Map<string, Map<string, CandidateMatchCell>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"" | ApproachStatus>("");
  const [q, setQ] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<"" | Priority>("");
  const [categoryFilter, setCategoryFilter] = useState<string>(""); // "" = すべて

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [co, rd, fu, mm] = await Promise.all([
          listCompaniesEnriched(),
          listReady(200),
          listFollowUps(),
          listCompanyCandidateMatches(),
        ]);
        if (!alive) return;
        setCompanies(co);
        setReadyCount(rd.length);
        setFollows(fu);
        setCandidates(mm.candidates);
        setMatchesByCompany(mm.byCompany);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // 企業データから抽出した業種一覧 (件数付き)
  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of companies) {
      const k = c.category ?? "未分類";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]); // 件数降順
  }, [companies]);

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
      if (categoryFilter && (c.category ?? "未分類") !== categoryFilter) return false;
      return true;
    });
  }, [companies, q, priorityFilter, statusFilter, categoryFilter]);

  // ステータス別カウント
  const statusCounts = useMemo(() => {
    const c: Record<ApproachStatus, number> = { untouched: 0, sent: 0, replied: 0, meeting: 0, closed: 0 };
    for (const co of companies) c[co.approach_status] = (c[co.approach_status] ?? 0) + 1;
    return c;
  }, [companies]);

  if (loading) return <div className="text-sm text-gray-500">読み込み中…</div>;

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
            { label: "送信可能", value: readyCount, color: "#FF9600" },
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

      {/* ─── 3. 📋 企業一覧 ──────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black text-[#4b4b4b]">
              📋 企業一覧 ({filteredCompanies.length} / {companies.length} 件)
            </span>
          </div>

          {/* フィルタ行 1: 検索 + 優先度 + リセット */}
          <div className="flex flex-wrap gap-2 items-center mb-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="🔍 企業名で絞り込み"
              className="rounded-lg border border-gray-200 px-2 py-1 text-xs w-44"
            />
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as "" | Priority)}
              className="rounded-lg border border-gray-200 px-2 py-1 text-xs"
            >
              <option value="">優先度すべて</option>
              <option value="S">S</option><option value="A">A</option><option value="B">B</option><option value="C">C</option>
            </select>
            {(q || priorityFilter || statusFilter || categoryFilter) && (
              <button
                onClick={() => { setQ(""); setPriorityFilter(""); setStatusFilter(""); setCategoryFilter(""); }}
                className="text-[10px] font-bold text-[#777] hover:text-[#4b4b4b] underline ml-auto"
              >
                絞り込みクリア
              </button>
            )}
          </div>

          {/* フィルタ行 2: 業種 */}
          <div className="flex flex-wrap gap-1 items-center mb-2">
            <span className="text-[10px] font-extrabold text-[#777] mr-1">業種:</span>
            <FilterChip active={categoryFilter === ""} onClick={() => setCategoryFilter("")} label="すべて" count={companies.length} />
            {categoryCounts.map(([cat, count]) => (
              <FilterChip
                key={cat}
                active={categoryFilter === cat}
                onClick={() => setCategoryFilter(categoryFilter === cat ? "" : cat)}
                label={cat}
                count={count}
              />
            ))}
          </div>

          {/* フィルタ行 3: アプローチ状況 */}
          <div className="flex flex-wrap gap-1 items-center">
            <span className="text-[10px] font-extrabold text-[#777] mr-1">状況:</span>
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

        <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[900px]">
          <thead className="bg-gray-50 text-left text-[10px] uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 sticky left-0 bg-gray-50">企業</th>
              {candidates.map((cand) => (
                <th key={cand.code} className="px-2 py-2 text-center" title={`${cand.name} とのマッチ精度`}>
                  {cand.name}
                </th>
              ))}
              <th className="px-2 py-2 text-right">求人</th>
              <th className="px-3 py-2">状況</th>
              <th className="px-3 py-2">リンク</th>
            </tr>
          </thead>
          <tbody>
            {filteredCompanies.slice(0, 100).map((c) => {
              const form = c.contact_paths.find((p) => p.kind === "form");
              const email = c.contact_paths.find((p) => p.kind === "email");
              const statusDef = APPROACH_STATUSES.find((s) => s.key === c.approach_status)!;
              const counts = c.activity_counts;
              const hasActivity = (counts.sent ?? 0) + (counts.replied ?? 0) + (counts.meeting ?? 0) > 0;
              const candMatches = matchesByCompany.get(c.id);
              return (
                <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50/40">
                  {/* 企業 (優先度バッジ + カテゴリ) */}
                  <td className="px-3 py-2 sticky left-0 bg-white hover:bg-gray-50/40">
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

                  {/* 候補者ごとのマッチ精度 */}
                  {candidates.map((cand) => {
                    const cell = candMatches?.get(cand.code);
                    return (
                      <td key={cand.code} className="px-2 py-2 text-center">
                        {cell ? <MatchBadge grade={cell.grade} score={cell.score} /> : <span className="text-gray-300 text-[10px]">—</span>}
                      </td>
                    );
                  })}

                  {/* 求人 (open / strong) */}
                  <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                    <span className="text-[#4b4b4b]">{c.open_jobs}</span>
                    {c.strong_matches > 0 && (
                      <span className="ml-1 text-green-600 font-bold">◎{c.strong_matches}</span>
                    )}
                  </td>

                  {/* 状況 */}
                  <td className="px-3 py-2 whitespace-nowrap">
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

                  {/* リンク: 採用ページ / 企業 / 問い合わせ */}
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <LinkButton
                        url={c.recruit_page_url}
                        searchQuery={`${c.name} 採用 求人`}
                        emoji="📋"
                        label="求人"
                        color="#CE82FF"
                      />
                      <LinkButton
                        url={c.corporate_url}
                        searchQuery={`${c.name} 公式サイト`}
                        emoji="🏢"
                        label="企業"
                        color="#6b7280"
                      />
                      {form ? (
                        <a href={form.url} target="_blank" rel="noopener noreferrer" title="お問い合わせフォーム"
                          className="px-2 py-0.5 rounded-full bg-[#1CB0F6] text-white text-[10px] font-bold hover:opacity-90">📝 問</a>
                      ) : (
                        <a href={googleSearchUrl(`${c.name} お問い合わせ`)} target="_blank" rel="noopener noreferrer"
                          title="お問い合わせページを Google で検索"
                          className="px-2 py-0.5 rounded-full bg-white border border-[#1CB0F6] text-[#1CB0F6] text-[10px] font-bold hover:bg-[#1CB0F6]/10">🔍 問</a>
                      )}
                      {email && (
                        <a href={email.url ?? `mailto:${email.value}`} target="_blank" rel="noopener noreferrer" title={email.value ?? ""}
                          className="px-2 py-0.5 rounded-full bg-[#58CC02] text-white text-[10px] font-bold hover:opacity-90">✉ Mail</a>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        {filteredCompanies.length > 100 && (
          <div className="px-3 py-2 text-[10px] text-center text-[#afafaf] border-t border-gray-100">
            {filteredCompanies.length - 100} 件を非表示中 — フィルタで絞り込んでください
          </div>
        )}
      </section>

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

// 直接 URL がある場合はそこに飛ぶ。
// 無い / 壊れてそうな場合は Google 検索にフォールバック (枠線スタイルで区別)。
// 引き継ぎ後にデータ整備が進めば直接リンク率が上がる前提。
function LinkButton({
  url, searchQuery, emoji, label, color,
}: { url: string | null | undefined; searchQuery: string; emoji: string; label: string; color: string }) {
  const normalized = normalizeUrl(url);
  if (normalized) {
    return (
      <a href={normalized} target="_blank" rel="noopener noreferrer" title={normalized}
        className="px-2 py-0.5 rounded-full text-white text-[10px] font-bold hover:opacity-90"
        style={{ backgroundColor: color }}>
        {emoji} {label}
      </a>
    );
  }
  return (
    <a href={googleSearchUrl(searchQuery)} target="_blank" rel="noopener noreferrer"
      title={`「${searchQuery}」を Google で検索`}
      className="px-2 py-0.5 rounded-full bg-white text-[10px] font-bold hover:bg-gray-50"
      style={{ borderWidth: 1, borderStyle: "solid", borderColor: color, color }}>
      🔍 {label}
    </a>
  );
}

// "//example.com" や "example.com" のような protocol 抜けにも対応。
// 無効なものは null を返してフォールバック判定させる。
function normalizeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  if (s.startsWith("mailto:") || s.startsWith("tel:")) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return "https:" + s;
  // ドメインっぽい文字列なら https を付けて開く (e.g. "example.co.jp/recruit/")
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}/i.test(s)) return "https://" + s;
  return null;
}

function googleSearchUrl(q: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}

// 候補者 × 企業 のマッチ精度を 1 セル分にコンパクト表示。
// 判定 (◎○△×) ごとに色分け、点数も併記する。
function MatchBadge({ grade, score }: { grade: Grade; score: number }) {
  const color =
    grade === "◎" ? "bg-green-100 text-green-700 border-green-300" :
    grade === "○" ? "bg-blue-50 text-blue-700 border-blue-200" :
    grade === "△" ? "bg-gray-50 text-gray-500 border-gray-200" :
                    "bg-red-50 text-red-400 border-red-100";
  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded border px-1 py-0.5 text-[10px] font-extrabold tabular-nums ${color}`}
      title={`判定 ${grade} / スコア ${score}`}
    >
      <span>{grade}</span>
      <span>{score}</span>
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
