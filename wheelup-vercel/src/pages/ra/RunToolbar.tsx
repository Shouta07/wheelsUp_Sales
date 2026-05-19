import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/ra/queries";

type Kind = "crawl" | "match" | "discover" | "import" | "enrich";
type Spec = { key: Kind; label: string; emoji: string; params?: Record<string, string | number>; expected: string };

const KINDS: Spec[] = [
  { key: "import",   label: "シード投入",   emoji: "📥", expected: "246社+4候補者の投入" },
  { key: "enrich",   label: "URL自動補完",  emoji: "🤖", params: { limit: 3 }, expected: "3社のURLをGemini推定" },
  { key: "enrich",   label: "URL再検証",    emoji: "🔄", params: { limit: 5, verify: 1 }, expected: "既存URLをHEAD検証、deadなら差し替え (5社まで)" },
  { key: "crawl",    label: "求人クロール", emoji: "🕸", params: { limit: 2 }, expected: "2社の採用ページから求人抽出" },
  { key: "match",    label: "候補者マッチ", emoji: "🎯", params: { limit: 2 }, expected: "2求人×4候補者の◎○△×採点" },
  { key: "match",    label: "マッチ再採点", emoji: "♻️", params: { limit: 5, force: 1 }, expected: "既存マッチを新プロンプトで再採点 (5求人まで)" },
  { key: "discover", label: "新規企業発掘", emoji: "🔍", params: { count: 5 }, expected: "Geminiが5社提案" },
];

type RunResult = { kind: Kind; ok: boolean; summary: string; ts: Date };

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }

export default function RunToolbar({ onDone }: { onDone?: () => void }) {
  const [busy, setBusy] = useState<Kind | null>(null);
  const [history, setHistory] = useState<RunResult[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // ─── 全自動モード ───────────────────────────────────────
  const [autoMode, setAutoMode] = useState(false);
  const [autoStatus, setAutoStatus] = useState<string>("");
  const [autoCycle, setAutoCycle] = useState(0);
  const cancelRef = useRef(false);

  // 全自動モード: enrich → 待機 → crawl → 待機 → match → 待機 → 繰り返し
  useEffect(() => {
    if (!autoMode) {
      cancelRef.current = true;
      setAutoStatus("");
      return;
    }
    cancelRef.current = false;

    async function runStage(kind: Kind, params: Record<string, string | number>, label: string, cycleNum: number) {
      if (cancelRef.current) return;
      setAutoStatus(`サイクル ${cycleNum}: ${label} 実行中…`);
      try {
        const r = await api.run(kind, params);
        const errCount = Array.isArray((r as { errors?: unknown[] }).errors) ? (r as { errors: unknown[] }).errors.length : 0;
        const summary = Object.entries(r)
          .filter(([k, v]) => !["ok", "errors"].includes(k) && (typeof v === "number" || typeof v === "string"))
          .map(([k, v]) => `${k}=${v}`).join(" ");
        pushHistory({ kind, ok: errCount === 0, summary: `[auto] ${summary}${errCount > 0 ? ` ⚠${errCount}` : ""}`, ts: new Date() });
        onDone?.();
      } catch (e) {
        pushHistory({ kind, ok: false, summary: `[auto] ${(e as Error).message.slice(0, 100)}`, ts: new Date() });
      }
    }

    async function loop() {
      let cycle = 0;
      while (!cancelRef.current) {
        cycle += 1;
        setAutoCycle(cycle);

        await runStage("enrich", { limit: 3 }, "URL 補完", cycle);
        if (cancelRef.current) break;
        await waitWithCountdown("次まで", 25);

        await runStage("crawl", { limit: 2 }, "求人クロール", cycle);
        if (cancelRef.current) break;
        await waitWithCountdown("次まで", 25);

        await runStage("match", { limit: 2 }, "候補者マッチ", cycle);
        if (cancelRef.current) break;
        await waitWithCountdown("次サイクルまで", 30);
      }
      setAutoStatus("停止しました");
    }

    async function waitWithCountdown(label: string, seconds: number) {
      for (let s = seconds; s > 0; s--) {
        if (cancelRef.current) return;
        setAutoStatus(`${label} ${s}秒`);
        await sleep(1000);
      }
    }

    loop();

    return () => { cancelRef.current = true; };
  }, [autoMode, onDone]);

  // ─── 単発ボタン ─────────────────────────────────────────
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
        ok: errCount === 0,
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
    setHistory((arr) => [r, ...arr].slice(0, 8));
  }

  return (
    <div className="rounded-xl bg-white border border-[#e5e5e5] p-4 mb-3">
      {/* 🎯 メインアクション: 全自動モード だけを大きく目立たせる */}
      <div className="flex flex-col items-center gap-2">
        <button
          onClick={() => setAutoMode((v) => !v)}
          disabled={busy !== null}
          className={`px-6 py-3 rounded-2xl text-base font-black transition-all shadow-sm ${
            autoMode
              ? "bg-red-500 text-white hover:bg-red-600"
              : "bg-[#58CC02] text-white hover:bg-[#46a302]"
          }`}
          style={{ borderBottom: autoMode ? "4px solid #b91c1c" : "4px solid #46a302" }}
        >
          {autoMode ? "■ 自動収集を停止" : "▶ 自動でデータを集める"}
        </button>
        {autoMode ? (
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-bold text-green-700">running</span>
            <span className="text-xs text-[#4b4b4b] tabular-nums">
              {autoStatus} / cycle {autoCycle}
            </span>
          </div>
        ) : (
          <p className="text-[11px] text-[#afafaf] text-center">
            URL補完 → 求人クロール → 候補者マッチ を自動ループで回します<br />
            (1サイクル ~90秒、Gemini無料枠 ~5RPM)
          </p>
        )}
      </div>

      {/* 詳細操作 (折りたたみ) */}
      <details
        open={advancedOpen}
        onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
        className="mt-3 pt-3 border-t border-dashed border-[#e5e5e5]"
      >
        <summary className="cursor-pointer text-[11px] font-bold text-[#afafaf] hover:text-[#4b4b4b]">
          {advancedOpen ? "▼" : "▶"} 個別実行 (デバッグ・初回投入用)
        </summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {KINDS.map((t, idx) => {
            const isBusy = busy === t.key;
            const disabled = busy !== null || autoMode;
            return (
              <button
                key={`${t.key}-${idx}`}
                onClick={() => run(t)}
                disabled={disabled}
                title={t.expected}
                className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all ${
                  isBusy
                    ? "bg-yellow-50 border-yellow-300 text-yellow-700"
                    : disabled
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
        </div>
        <p className="mt-2 text-[10px] text-[#afafaf]">
          通常は「自動でデータを集める」だけで OK。これらは限定的に動かしたい時用。
        </p>
      </details>

      {/* 実行履歴 (最大 8 件、最新が上) */}
      {history.length > 0 && (
        <div className="mt-3 border-t border-[#e5e5e5] pt-2 space-y-1">
          <div className="text-[10px] font-bold text-[#afafaf] mb-1">直近の結果 (新しい順)</div>
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

    </div>
  );
}
