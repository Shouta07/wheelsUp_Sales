import { useState } from "react";
import { api } from "../../lib/ra/queries";

type Kind = "crawl" | "match" | "discover" | "import" | "enrich";
type Spec = { key: Kind; label: string; emoji: string; params?: Record<string, string | number>; expected: string };

// limit を Gemini free tier 10 RPM × Vercel 60s 関数枠に合わせて控えめに。
//   enrich 3 社 ≈ 15s
//   crawl  2 社 ≈ 15-20s
//   match  2 求人 × 4 候補者 = 8 calls ≈ 30-40s
// 何回か押せば 246 社全部に行き渡る、を許容する設計。
const KINDS: Spec[] = [
  { key: "import",   label: "シード投入",   emoji: "📥", expected: "246社+4候補者の投入" },
  { key: "enrich",   label: "URL自動補完",  emoji: "🤖", params: { limit: 3 }, expected: "3社のURLをGemini推定" },
  { key: "crawl",    label: "求人クロール", emoji: "🕸", params: { limit: 2 }, expected: "2社の採用ページから求人抽出" },
  { key: "match",    label: "候補者マッチ", emoji: "🎯", params: { limit: 2 }, expected: "2求人×4候補者の◎○△×採点" },
  { key: "discover", label: "新規企業発掘", emoji: "🔍", params: { count: 5 }, expected: "Geminiが5社提案" },
];

type RunResult = { kind: Kind; ok: boolean; summary: string; ts: Date };

export default function RunToolbar({ onDone }: { onDone?: () => void }) {
  const [busy, setBusy] = useState<Kind | null>(null);
  const [history, setHistory] = useState<RunResult[]>([]);

  async function run(spec: Spec) {
    setBusy(spec.key);
    const startedAt = Date.now();
    try {
      const r = await api.run(spec.key, spec.params);
      const summary = Object.entries(r)
        .filter(([k, v]) => !["ok", "errors"].includes(k) && (typeof v === "number" || typeof v === "string"))
        .slice(0, 6)
        .map(([k, v]) => `${k}=${v}`)
        .join(" / ");
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      const errCount = Array.isArray((r as { errors?: unknown[] }).errors) ? (r as { errors: unknown[] }).errors.length : 0;
      pushHistory({
        kind: spec.key,
        ok: true,
        summary: `${summary}${errCount > 0 ? ` / ⚠️ ${errCount}件のエラー` : ""} (${elapsed}s)`,
        ts: new Date(),
      });
      onDone?.();
    } catch (e) {
      const elapsed = Math.round((Date.now() - startedAt) / 1000);
      pushHistory({
        kind: spec.key,
        ok: false,
        summary: `${(e as Error).message} (${elapsed}s)`,
        ts: new Date(),
      });
    } finally {
      setBusy(null);
    }
  }

  function pushHistory(r: RunResult) {
    setHistory((arr) => [r, ...arr].slice(0, 6));
  }

  return (
    <div className="rounded-xl bg-white border border-[#e5e5e5] p-3 mb-3">
      {/* ボタン群 */}
      <div className="flex flex-wrap items-center gap-2">
        {KINDS.map((t) => {
          const isBusy = busy === t.key;
          const otherBusy = busy !== null && busy !== t.key;
          return (
            <button
              key={t.key}
              onClick={() => run(t)}
              disabled={busy !== null}
              title={t.expected}
              className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all ${
                isBusy
                  ? "bg-yellow-50 border-yellow-300 text-yellow-700"
                  : otherBusy
                  ? "bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed"
                  : "bg-white border-[#e5e5e5] text-[#4b4b4b] hover:bg-gray-50"
              }`}
              style={{ borderBottom: isBusy ? "2px solid #d97706" : undefined }}
            >
              {isBusy ? (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                  実行中…
                </span>
              ) : (
                <>{t.emoji} {t.label}</>
              )}
            </button>
          );
        })}
        {busy && (
          <span className="ml-2 text-[10px] text-[#afafaf]">
            完了まで 10-40 秒 / 他のボタンは無効化中
          </span>
        )}
      </div>

      {/* 実行履歴 (最大 6 件、最新が上) */}
      {history.length > 0 && (
        <div className="mt-3 border-t border-[#e5e5e5] pt-2 space-y-1">
          <div className="text-[10px] font-bold text-[#afafaf] mb-1">あなたが今回押したアクションの結果</div>
          {history.map((h, i) => (
            <div key={i} className="flex items-start gap-2 text-[10px]">
              <span className={`px-1.5 py-0.5 rounded font-bold tabular-nums ${
                h.ok ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
              }`}>
                {h.ok ? "✓" : "✗"} {h.kind}
              </span>
              <span className="text-[#afafaf]">{h.ts.toLocaleTimeString("ja-JP")}</span>
              <span className={`flex-1 ${h.ok ? "text-[#4b4b4b]" : "text-red-700"}`}>{h.summary}</span>
            </div>
          ))}
        </div>
      )}

      {/* ヘルプ行 */}
      <div className="mt-2 pt-2 border-t border-dashed border-[#e5e5e5] text-[10px] text-[#afafaf]">
        💡 Gemini 無料枠 10 RPM 制限あり。ボタンは <strong>30秒くらい間隔を空けて</strong> 押すと安定。
      </div>
    </div>
  );
}
