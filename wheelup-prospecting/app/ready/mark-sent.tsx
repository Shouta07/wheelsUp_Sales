"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ReadyRow } from "@/lib/types";

export function MarkSentButton({ row }: { row: ReadyRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    const secret = window.prompt("CRON_SECRET を入力してください（一回だけ）", "");
    if (!secret) return;
    setErr(null);
    const res = await fetch(`/api/activity?secret=${encodeURIComponent(secret)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_id: row.company_id,
        job_id: row.job_id,
        candidate_id: row.candidate_id,
        kind: "sent",
        channel: "manual",
        body: `${row.candidate_name} → ${row.company_name} / ${row.job_title}`,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(json.error || `HTTP ${res.status}`);
      return;
    }
    setDone(true);
    startTransition(() => router.refresh());
  }

  if (done) return <span className="text-xs text-good">送信記録済</span>;
  return (
    <div className="flex items-center justify-end gap-2">
      {err && <span className="text-xs text-bad">{err}</span>}
      <button className="btn-primary" disabled={pending} onClick={onClick}>
        送信記録
      </button>
    </div>
  );
}
