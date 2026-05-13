"use client";

import { useState } from "react";

export function MarkSentButton(props: {
  matchId: string;
  companyId: string;
  jobId: string;
  candidateId: string;
  channel: string;
}) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    const secret = typeof window !== "undefined" ? window.prompt("CRON_SECRET") : "";
    if (!secret) return;
    setState("sending");
    setErr(null);
    try {
      const res = await fetch(`/api/activity`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Send the secret via Authorization header so it does not end up
          // in browser history or server access logs.
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({
          match_id: props.matchId,
          company_id: props.companyId,
          job_id: props.jobId,
          candidate_id: props.candidateId,
          kind: "proposal_sent",
          channel: props.channel,
          body: "ボタンから記録",
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      setState("done");
    } catch (e) {
      setErr((e as Error).message);
      setState("error");
    }
  }

  if (state === "done") return <span className="text-green-700 text-xs">送信記録済</span>;
  return (
    <button
      onClick={go}
      disabled={state === "sending"}
      className="text-xs px-2 py-1 rounded bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
      title={err ?? ""}
    >
      {state === "sending" ? "..." : "送信記録"}
    </button>
  );
}
