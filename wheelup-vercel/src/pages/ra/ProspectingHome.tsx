import { useEffect, useState } from "react";
import { getMonthlyKPI, listCompanyOverview, listReady } from "../../lib/ra/queries";
import type { MonthlyKPI } from "../../lib/ra/queries";
import type { CompanyOverview, ReadyRow } from "../../lib/ra/types";

const MEETING_GOAL = 5; // 月の新規打ち合わせ設定目標 (2026/5/14 ミーティング決定)

export default function ProspectingHome({
  onOpenCompany,
}: {
  onOpenCompany: (id: string) => void;
}) {
  const [companies, setCompanies] = useState<CompanyOverview[]>([]);
  const [ready, setReady] = useState<ReadyRow[]>([]);
  const [kpi, setKpi] = useState<MonthlyKPI | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [co, rd, k] = await Promise.all([
          listCompanyOverview(),
          listReady(20),
          getMonthlyKPI(),
        ]);
        if (!alive) return;
        setCompanies(co);
        setReady(rd);
        setKpi(k);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="text-sm text-gray-500">読み込み中…</div>;

  const total = companies.length;
  const s = companies.filter((c) => c.priority === "S").length;
  const a = companies.filter((c) => c.priority === "A").length;
  const openJobs = companies.reduce((acc, c) => acc + (c.open_jobs ?? 0), 0);
  const strong = companies.reduce((acc, c) => acc + (c.strong_matches ?? 0), 0);

  const goalPct = kpi ? Math.min(100, (kpi.meeting / MEETING_GOAL) * 100) : 0;
  const monthLabel = new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "short" });

  return (
    <div className="space-y-5">
      {/* 月次 KPI - 辻内さん「月 5 件目標」の進捗 */}
      <section className="rounded-2xl bg-gradient-to-br from-[#58CC02]/10 to-[#1CB0F6]/10 border border-[#e5e5e5] p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-black text-[#4b4b4b]">{monthLabel}の KPI</h2>
            <p className="text-[10px] text-[#afafaf]">月 5 件の新規打ち合わせ設定 (目標)</p>
          </div>
          <div className="text-right">
            <div className="text-xl font-black text-[#4b4b4b] tabular-nums">
              {kpi?.meeting ?? 0}
              <span className="text-xs text-[#afafaf]"> / {MEETING_GOAL}</span>
            </div>
            <div className="text-[10px] text-[#afafaf]">打ち合わせ確定</div>
          </div>
        </div>
        {/* Progress bar */}
        <div className="w-full bg-white rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-[#58CC02] transition-all"
            style={{ width: `${goalPct}%` }}
          />
        </div>
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <Kpi label="送信" value={kpi?.sent ?? 0} />
          <Kpi label="商談化率" value={kpi?.meeting_rate != null ? `${(kpi.meeting_rate * 100).toFixed(1)}%` : "-"} />
          <Kpi label="◎ 判定" value={kpi?.double_circle_total ?? 0} />
          <Kpi label="◎ 的中率" value={kpi?.double_circle_hit_rate != null ? `${(kpi.double_circle_hit_rate * 100).toFixed(1)}%` : "-"} />
        </div>
      </section>

      {/* カバレッジ系 */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="ターゲット企業" value={total} />
        <Stat label="S ランク" value={s} />
        <Stat label="A ランク" value={a} />
        <Stat label="公開求人" value={openJobs} />
        <Stat label="◎○ マッチ" value={strong} accent />
      </section>

      <section className="rounded-xl bg-white border border-gray-200 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-black text-[#4b4b4b]">実行待ち（直近 20 件）</h2>
          <span className="text-[10px] font-bold text-[#afafaf]">{ready.length}件</span>
        </div>
        {ready.length === 0 ? (
          <p className="text-xs text-gray-500">
            まだありません。<code>📥 シード投入</code> → <code>🤖 URL補完</code> → <code>🕸 クロール</code> → <code>🎯 マッチ</code> の順に押してください。
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {ready.map((r) => (
              <li key={r.match_id} className="py-2 flex items-center gap-2 text-xs">
                <span className={`w-5 text-center font-black ${r.grade === "◎" ? "text-green-600" : "text-blue-500"}`}>
                  {r.grade}
                </span>
                <span className="w-10 tabular-nums text-gray-500">{r.score}</span>
                <button
                  onClick={() => onOpenCompany(r.company_id)}
                  className="w-44 truncate text-left font-bold text-[#4b4b4b] hover:underline"
                >
                  {r.company_name}
                </button>
                <span className="flex-1 truncate text-gray-500">{r.job_title}</span>
                <span className="w-16 text-right text-[10px] text-gray-400">{r.candidate_name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-3 ${accent ? "ring-2 ring-[#58CC02]/30" : ""}`}>
      <div className="text-[10px] font-bold text-[#afafaf] uppercase">{label}</div>
      <div className="mt-0.5 text-2xl font-black tabular-nums text-[#4b4b4b]">{value}</div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-white p-2">
      <div className="text-[10px] font-bold text-[#afafaf]">{label}</div>
      <div className="text-base font-black text-[#4b4b4b] tabular-nums">{value}</div>
    </div>
  );
}
