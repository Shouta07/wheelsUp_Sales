import { useEffect, useState } from "react";
import { getProgressCounts, listRecentRuns } from "../../lib/ra/queries";
import type { CrawlRunRow, ProgressCounts } from "../../lib/ra/queries";

/**
 * 「今 DB がどうなってるか」「直近の cron / 手動アクションが何件処理したか」を
 * RA トップで常に見えるようにするパネル。
 *
 * - 上段: 7 つの主要カウント (Companies / Jobs / Matches / Ready 等)
 * - 下段: 直近 5 件の実行履歴 (kind / 結果 / 経過時間)
 *
 * refreshKey が変わるたび (= RunToolbar が完了通知を出した時) に再取得する。
 */
export default function ProgressPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [counts, setCounts] = useState<ProgressCounts | null>(null);
  const [runs, setRuns] = useState<CrawlRunRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [c, r] = await Promise.all([getProgressCounts(), listRecentRuns(5)]);
        if (!alive) return;
        setCounts(c);
        setRuns(r);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [refreshKey]);

  if (loading && !counts) {
    return <div className="text-[10px] text-[#afafaf]">DB 状態を取得中…</div>;
  }
  if (!counts) return null;

  return (
    <div className="rounded-xl bg-white border border-[#e5e5e5] p-3 mb-3 text-xs">
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-black text-[#4b4b4b]">📊 進捗ダッシュボード</span>
        <span className="text-[10px] text-[#afafaf]">押したボタンの結果はここに反映されます</span>
      </div>

      {/* カウントタイル */}
      <div className="grid grid-cols-4 md:grid-cols-8 gap-2 mb-3">
        <Tile label="企業" value={counts.companies} hint="ra_companies" />
        <Tile label="URL補完済" value={counts.with_url} hint="採用URLあり" />
        <Tile label="クロール済" value={counts.crawled} hint="last_crawled_at あり" />
        <Tile label="求人(公開)" value={counts.open_jobs} hint="is_open=true" />
        <Tile label="マッチ総数" value={counts.matches_total} hint="◎○△×全て" />
        <Tile label="◎○マッチ" value={counts.strong_matches} accent />
        <Tile label="実行待ち" value={counts.ready} accent hint="◎○×未送信" />
        <Tile label="今月送信" value={counts.sent_this_month} hint="kind=sent" />
      </div>

      {/* 直近の実行履歴 */}
      <div className="border-t border-[#e5e5e5] pt-2">
        <div className="text-[10px] font-bold text-[#afafaf] mb-1">直近の実行 (cron + ボタン)</div>
        {runs.length === 0 ? (
          <p className="text-[10px] text-[#afafaf]">まだ実行履歴がありません</p>
        ) : (
          <ul className="space-y-0.5">
            {runs.map((r) => {
              // エラーメッセージは控えめに: 件数だけ目立たせて詳細は title (tooltip) に
              const errCount = countErrors(r.error);
              return (
                <li key={r.id} className="flex items-center gap-2 text-[10px]">
                  <span className={`px-1.5 py-0.5 rounded font-bold ${
                    r.ok === false ? "bg-amber-100 text-amber-700"
                    : r.ok === true ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-500"
                  }`}>{r.kind}</span>
                  <span className="text-[#afafaf] tabular-nums">{formatAgo(r.finished_at)}</span>
                  <span className="flex-1 truncate text-gray-600">{summarizeStats(r.stats)}</span>
                  {errCount > 0 && (
                    <span className="text-amber-600 text-[10px]" title={r.error ?? ""}>
                      ⚠ {errCount}件スキップ
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function Tile({ label, value, hint, accent }: { label: string; value: number; hint?: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-lg p-1.5 ${accent ? "bg-[#58CC02]/10 border border-[#58CC02]/40" : "bg-gray-50"}`}
      title={hint ?? ""}
    >
      <div className="text-[9px] font-bold text-[#afafaf] uppercase truncate">{label}</div>
      <div className="text-lg font-black tabular-nums text-[#4b4b4b] leading-none mt-0.5">{value}</div>
    </div>
  );
}

function formatAgo(iso: string | null): string {
  if (!iso) return "-";
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return "数秒前";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}時間前`;
  return new Date(t).toLocaleDateString("ja-JP");
}

function countErrors(error: string | null): number {
  if (!error) return 0;
  // ra_crawl_runs.error は " | " 区切りでエラーリストを保存する設計
  return error.split(" | ").filter((s) => s.trim().length > 0).length;
}

function summarizeStats(stats: Record<string, unknown> | null): string {
  if (!stats) return "";
  const interesting = ["crawled", "newJobs", "scored", "enriched", "queued", "suggested", "added", "companies", "candidates", "stale"];
  return Object.entries(stats)
    .filter(([k]) => interesting.includes(k))
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
}
