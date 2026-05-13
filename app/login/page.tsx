"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

function LoginForm() {
  const params = useSearchParams();
  const reason = params.get("reason");
  const next = params.get("next") || "/";

  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setErr(null);
    try {
      const supa = getSupabaseBrowser();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
      const { error } = await supa.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
      });
      if (error) throw error;
      setState("sent");
    } catch (e) {
      setErr((e as Error).message);
      setState("error");
    }
  }

  return (
    <div className="max-w-md mx-auto mt-16 bg-white border border-gray-200 rounded p-6 space-y-4">
      <h1 className="text-xl font-semibold">サインイン</h1>
      <p className="text-sm text-gray-600">
        登録済みのメールアドレスにマジックリンクを送ります。リンクをクリックすると自動でサインインします。
      </p>
      {reason === "not_allowed" && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded p-3">
          このメールアドレスは許可リストに含まれていません。管理者に連絡してください。
        </div>
      )}
      {state === "sent" ? (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded p-3">
          リンクをメールに送信しました。受信ボックスを確認してください。
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            autoComplete="email"
          />
          <button
            type="submit"
            disabled={state === "sending"}
            className="w-full px-3 py-2 rounded bg-brand-600 text-white text-sm hover:bg-brand-700 disabled:opacity-50"
          >
            {state === "sending" ? "送信中..." : "マジックリンクを送る"}
          </button>
          {err && <p className="text-red-700 text-xs">{err}</p>}
        </form>
      )}
      <p className="text-xs text-gray-400">
        新規ユーザーは管理者が事前に登録する必要があります（このフォームでは新規作成しません）。
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-500">loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
