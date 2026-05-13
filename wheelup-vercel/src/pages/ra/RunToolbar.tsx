import { useState } from "react";
import { api } from "../../lib/ra/queries";

type Kind = "crawl" | "match" | "discover" | "import";
const KINDS: { key: Kind; label: string; emoji: string; params?: Record<string, string | number> }[] = [
  { key: "import",   label: "シード投入",     emoji: "📥" },
  { key: "crawl",    label: "求人クロール",   emoji: "🕸",  params: { limit: 20 } },
  { key: "match",    label: "候補者マッチ",   emoji: "🎯", params: { limit: 20 } },
  { key: "discover", label: "新規企業発掘",   emoji: "🔍", params: { count: 10 } },
];

export default function RunToolbar({ onDone }: { onDone?: () => void }) {
  const [busy, setBusy] = useState<Kind | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function run(k: Kind, params?: Record<string, string | number>) {
    setBusy(k); setMsg(null); setErr(null);
    try {
      const r = await api.run(k, params);
      const summary = Object.entries(r)
        .filter(([key]) => !["ok", "errors"].includes(key))
        .slice(0, 6)
        .map(([key, v]) => `${key}=${typeof v === "object" ? JSON.stringify(v).slice(0, 40) : v}`)
        .join(" / ");
      setMsg(`${k}: ${summary}`);
      onDone?.();
    } catch (e) {
      setErr(`${k}: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      {KINDS.map((t) => (
        <button
          key={t.key}
          onClick={() => run(t.key, t.params)}
          disabled={busy !== null}
          className={`px-2.5 py-1 rounded-xl text-[10px] font-black border transition-colors ${
            busy === t.key
              ? "bg-gray-100 border-gray-200 text-gray-400"
              : "bg-white border-[#e5e5e5] text-[#4b4b4b] hover:bg-gray-50"
          }`}
        >
          {busy === t.key ? "実行中…" : `${t.emoji} ${t.label}`}
        </button>
      ))}
      {msg && <span className="ml-2 text-[10px] text-green-700">{msg}</span>}
      {err && <span className="ml-2 text-[10px] text-red-600">{err}</span>}
    </div>
  );
}
