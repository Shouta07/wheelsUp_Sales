import { useEffect, useState } from "react";
import { fetchSetupStatus, seedMeetingData, type SetupStatus } from "../api/client";
import { api as raApi } from "../lib/ra/queries";

/**
 * 本番セットアップの未完了項目を1画面に集約。
 * すべて満たされていれば描画しない。
 */
export default function SetupStatusBar() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetchSetupStatus();
      setStatus(r);
    } catch {
      // /api/setup-status 自体が落ちる時 = まだ env すら無い可能性
      setStatus({
        ready: false,
        env: {},
        tables: null,
        seed: null,
        message: "/api/setup-status が応答していません — Vercel デプロイ or 環境変数を確認",
      });
    }
  }

  useEffect(() => { load(); }, []);

  if (!status || status.ready) return null;

  const env = status.env;
  const schemaMissing = status.schemaMissing ?? [];
  const seedMissing = status.seedMissing ?? [];
  const envMissing = Object.entries(env)
    .filter(([k, v]) => !v && k !== "LARK_OR_SLACK_WEBHOOK") // Lark/Slackは任意
    .map(([k]) => k);

  async function runFaceSeed() {
    setBusy("face"); setMsg(null);
    try {
      const r = await seedMeetingData();
      setMsg(r.message);
      await load();
    } catch (e) { setMsg(`失敗: ${(e as Error).message}`); }
    setBusy(null);
  }

  async function runRaSeed() {
    setBusy("ra"); setMsg(null);
    try {
      const r = await raApi.run("import");
      setMsg(`RAシード: 企業=${(r as { companies?: number }).companies ?? "?"} / 候補者=${(r as { candidates?: number }).candidates ?? "?"}`);
      await load();
    } catch (e) { setMsg(`失敗: ${(e as Error).message}`); }
    setBusy(null);
  }

  return (
    <div className="bg-amber-50 border-b border-amber-300">
      <div className="mx-auto max-w-5xl px-4 py-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-extrabold text-amber-900">⚠️ セットアップ未完了</span>
          <span className="text-[10px] font-bold text-amber-700">{status.message}</span>
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-auto text-[10px] font-black text-amber-800 hover:underline"
          >
            {expanded ? "閉じる" : "詳細"}
          </button>
        </div>

        {expanded && (
          <div className="mt-2 space-y-2 text-[11px] text-amber-900">
            {/* 環境変数 */}
            <div>
              <div className="font-black mb-0.5">1. Vercel 環境変数</div>
              <div className="flex flex-wrap gap-1.5">
                {(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY", "CRON_SECRET", "LARK_OR_SLACK_WEBHOOK"] as const).map((k) => (
                  <span
                    key={k}
                    className={`px-1.5 py-0.5 rounded font-bold ${
                      env[k]
                        ? "bg-green-100 text-green-800"
                        : k === "LARK_OR_SLACK_WEBHOOK"
                          ? "bg-gray-100 text-gray-600"
                          : "bg-red-100 text-red-800"
                    }`}
                  >
                    {env[k] ? "✓" : k === "LARK_OR_SLACK_WEBHOOK" ? "—" : "✗"} {k}
                  </span>
                ))}
              </div>
              {envMissing.length > 0 && (
                <p className="mt-1 text-[10px]">
                  Vercel → Settings → Environment Variables で上記を追加 → Redeploy
                </p>
              )}
            </div>

            {/* スキーマ */}
            <div>
              <div className="font-black mb-0.5">2. Supabase テーブル</div>
              {status.tables && (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(status.tables).map(([name, p]) => (
                    <span
                      key={name}
                      className={`px-1.5 py-0.5 rounded font-bold ${p.ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}
                      title={p.error ?? ""}
                    >
                      {p.ok ? "✓" : "✗"} {name}{p.ok && p.count != null ? ` (${p.count})` : ""}
                    </span>
                  ))}
                </div>
              )}
              {schemaMissing.length > 0 && (
                <p className="mt-1 text-[10px]">
                  Supabase ダッシュボード → SQL Editor で <code>supabase/schema.sql</code> と <code>supabase/migration_002_ra_system.sql</code> を実行
                </p>
              )}
            </div>

            {/* シード */}
            <div>
              <div className="font-black mb-0.5">3. 初期データ投入</div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={runFaceSeed}
                  disabled={busy !== null || !seedMissing.includes("face_seed")}
                  className="px-2 py-1 rounded-lg text-[10px] font-black bg-amber-700 text-white disabled:bg-gray-300 disabled:text-gray-500"
                >
                  {busy === "face" ? "投入中…" : seedMissing.includes("face_seed") ? "📥 面談シード (31件)" : "✓ 面談シード済"}
                </button>
                <button
                  onClick={runRaSeed}
                  disabled={busy !== null || !seedMissing.includes("ra_seed")}
                  className="px-2 py-1 rounded-lg text-[10px] font-black bg-amber-700 text-white disabled:bg-gray-300 disabled:text-gray-500"
                >
                  {busy === "ra" ? "投入中…" : seedMissing.includes("ra_seed") ? "📥 RAシード (246社+4名)" : "✓ RAシード済"}
                </button>
                {seedMissing.includes("industry_seed") && (
                  <span className="text-[10px] text-amber-800">
                    学習Hub用: SQL Editor で <code>supabase/seed.sql</code> を実行
                  </span>
                )}
              </div>
              {msg && <p className="mt-1 text-[10px] font-bold text-amber-900">{msg}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
