import { useEffect, useState } from "react";
import { api } from "../../lib/ra/queries";
import type { Candidate, ReadyRow } from "../../lib/ra/types";
import { supabase } from "../../lib/supabase";
import Modal from "./Modal";

/**
 * 送信ワークフローモーダル
 *
 * 1 つのモーダルで以下を完結させる:
 *   - マッチ情報の確認 (◎○ / score / 理由 / 候補者プロフィール)
 *   - テンプレート選択 (初回 / 再送 / カジュアル)
 *   - 自動で会社名・候補者名・求人名・理由を埋め込んだ文面表示・編集
 *   - 「📋 コピー & Gmail起動」 ボタンで:
 *       a. クリップボードに文面コピー
 *       b. mailto: で Gmail 起動 (新タブ)
 *       c. activities に kind=sent を記録
 *   - 「📋 コピー & フォーム開く」 ボタンで:
 *       a. クリップボード
 *       b. 問い合わせフォーム URL を新タブで開く
 *       c. activities に kind=sent を記録
 *   - 「📋 コピーのみ」 で記録なし (まだ送らない場合)
 *
 * これで「文章を書く → コピー → 別タブで貼る → 戻って送信記録」の
 * 5 アクションが 1 アクションに圧縮される。
 */

type Template = "initial" | "followup" | "casual";
const TEMPLATES: Record<Template, { label: string; emoji: string }> = {
  initial:  { label: "初回アプローチ",  emoji: "📨" },
  followup: { label: "フォロー (再送)", emoji: "🔁" },
  casual:   { label: "カジュアル打診", emoji: "💬" },
};

export default function SendModal({
  row, onClose, onSent,
}: {
  row: ReadyRow;
  onClose: () => void;
  onSent: () => void;
}) {
  const [template, setTemplate] = useState<Template>("initial");
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 候補者の詳細プロフィールを取得 (送信文作成に活用)
  useEffect(() => {
    let alive = true;
    supabase.from("ra_candidates").select("*").eq("id", row.candidate_id).maybeSingle().then(({ data }) => {
      if (!alive) return;
      setCandidate(data as Candidate | null);
    });
    return () => { alive = false; };
  }, [row.candidate_id]);

  // テンプレ or 候補者情報が変わるたびに文面を再生成
  useEffect(() => {
    setBody(buildTemplate(template, row, candidate));
  }, [template, row, candidate]);

  async function handleSend(channel: "form" | "email" | "copy-only") {
    setBusy(channel); setErr(null);
    try {
      // 1) クリップボードへコピー (失敗しても続行)
      try {
        await navigator.clipboard.writeText(body);
        setCopied(true);
      } catch { /* clipboard may fail in some browsers; not fatal */ }

      // 2) チャネル別アクション
      const form  = row.company_contact_paths?.find((p) => p.kind === "form");
      const email = row.company_contact_paths?.find((p) => p.kind === "email");
      const emailAddr = email?.url ?? email?.value;

      if (channel === "form" && form?.url) {
        window.open(form.url, "_blank", "noopener,noreferrer");
      } else if (channel === "email" && emailAddr) {
        const subject = `【${row.candidate_name}様のご紹介】${row.job_title} (${row.company_name})`;
        const mailto = `mailto:${emailAddr}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        // 本文が長すぎる時 (mailto 制限) は subject のみで開く
        const safe = mailto.length > 1900 ? `mailto:${emailAddr}?subject=${encodeURIComponent(subject)}` : mailto;
        window.open(safe, "_blank", "noopener,noreferrer");
      }

      // 3) DB に sent を記録 (copy-only でも記録するか否か → 記録する: ユーザーは「送ろうとした」)
      if (channel !== "copy-only") {
        await api.activity({
          company_id: row.company_id,
          job_id:     row.job_id,
          candidate_id: row.candidate_id,
          kind:    "sent",
          channel: channel === "form" ? "form" : "email",
          body:    body.slice(0, 2000), // truncate to be safe
        });
        onSent();
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const form  = row.company_contact_paths?.find((p) => p.kind === "form");
  const email = row.company_contact_paths?.find((p) => p.kind === "email");

  return (
    <Modal title={`送信: ${row.company_name} × ${row.candidate_name}`} onClose={onClose} wide>
      {/* ヘッダー: マッチ情報 */}
      <div className="rounded-lg bg-[#f7f7f7] p-3 mb-3 text-xs">
        <div className="flex items-center gap-3 mb-2">
          <span className={`font-black text-base ${row.grade === "◎" ? "text-green-600" : "text-blue-500"}`}>
            {row.grade}
          </span>
          <span className="font-bold text-[#4b4b4b] tabular-nums">{row.score}</span>
          <span className="font-bold text-[#4b4b4b]">{row.company_name}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100">{row.company_priority}</span>
        </div>
        <div className="text-[#4b4b4b] mb-1"><strong>求人:</strong> {row.job_title}</div>
        <div className="text-[#4b4b4b] mb-1"><strong>候補者:</strong> {row.candidate_name}</div>
        {row.reasons && row.reasons.length > 0 && (
          <div className="text-[10px] text-gray-500 mt-1">
            <strong>マッチ理由:</strong> {row.reasons.slice(0, 3).join(" / ")}
          </div>
        )}
        {row.concerns && row.concerns.length > 0 && (
          <div className="text-[10px] text-amber-700 mt-0.5">
            <strong>懸念:</strong> {row.concerns.slice(0, 2).join(" / ")}
          </div>
        )}
        {candidate && (
          <div className="mt-2 pt-2 border-t border-gray-200 text-[10px] text-gray-600">
            <strong>候補者プロフィール:</strong> {candidate.headline}
            {candidate.profile?.desired_salary && (
              <span className="ml-2 text-gray-500">/ 希望: {candidate.profile.desired_salary}</span>
            )}
          </div>
        )}
      </div>

      {/* テンプレート切替 */}
      <div className="flex gap-1.5 mb-2">
        {(Object.keys(TEMPLATES) as Template[]).map((k) => {
          const t = TEMPLATES[k];
          return (
            <button
              key={k}
              onClick={() => setTemplate(k)}
              className={`px-2 py-1 rounded-lg text-[10px] font-black ${
                template === k
                  ? "bg-[#1CB0F6] text-white"
                  : "bg-gray-100 text-[#4b4b4b] hover:bg-gray-200"
              }`}
            >
              {t.emoji} {t.label}
            </button>
          );
        })}
      </div>

      {/* 本文編集 */}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="rounded-lg border border-gray-200 px-3 py-2 w-full h-72 font-mono text-[11px] leading-relaxed"
      />
      <p className="text-[10px] text-[#afafaf] mt-1">
        ⚠️ プレースホルダー [...] は **必ず自分の言葉で書き換えて** 送信してください
      </p>

      {err && <div className="mt-2 text-[10px] text-red-600">{err}</div>}
      {copied && !busy && <div className="mt-2 text-[10px] text-green-600">📋 クリップボードにコピー済</div>}

      {/* アクション */}
      <div className="flex flex-wrap gap-2 justify-end mt-3 pt-3 border-t border-gray-200">
        <button
          onClick={onClose}
          className="px-3 py-1.5 rounded-lg text-xs font-bold border border-gray-200 text-[#4b4b4b]"
        >
          キャンセル
        </button>
        <button
          onClick={() => handleSend("copy-only")}
          disabled={busy !== null}
          className="px-3 py-1.5 rounded-lg text-xs font-black bg-gray-200 text-[#4b4b4b] hover:bg-gray-300 disabled:opacity-50"
        >
          {busy === "copy-only" ? "..." : "📋 コピーのみ"}
        </button>
        {form && (
          <button
            onClick={() => handleSend("form")}
            disabled={busy !== null}
            className="px-3 py-1.5 rounded-lg text-xs font-black bg-[#1CB0F6] text-white hover:bg-[#1899D6] disabled:opacity-50"
            title={`コピー → ${form.url} を別タブで開く → 送信記録`}
          >
            {busy === "form" ? "..." : "📝 コピー&フォーム"}
          </button>
        )}
        {email && (
          <button
            onClick={() => handleSend("email")}
            disabled={busy !== null}
            className="px-3 py-1.5 rounded-lg text-xs font-black bg-[#58CC02] text-white hover:bg-[#46a302] disabled:opacity-50"
            title={`コピー → Gmail 起動 (${email.url ?? email.value}) → 送信記録`}
          >
            {busy === "email" ? "..." : "✉️ コピー&Gmail"}
          </button>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// テンプレート生成
// ---------------------------------------------------------------------------

function buildTemplate(kind: Template, row: ReadyRow, c: Candidate | null): string {
  const reasons = (row.reasons ?? []).slice(0, 3).map((r) => `・${r}`).join("\n");
  const headline = c?.headline ?? "(プロフィール取得中)";
  const desired = c?.profile?.desired_salary ?? "(別途)";
  const specialties = (c?.profile?.specialties ?? []).slice(0, 3).join(" / ");
  const inProgress = (c?.profile?.in_progress ?? []).join(" / ");

  if (kind === "initial") {
    return [
      `${row.company_name} 採用ご担当者様`,
      ``,
      `突然のご連絡失礼いたします。`,
      `建築設備 / FM / PM / 施設管理 / ゼネコン領域に特化した人材紹介、`,
      `Wheels Up の[氏名]と申します。`,
      ``,
      `御社の「${row.job_title}」のポジション拝見いたしました。`,
      `弊社で支援している候補者 ${row.candidate_name} 様について、御社の求人との`,
      `親和性が高いと判断し、ご紹介させていただきたくご連絡いたしました。`,
      ``,
      `【候補者プロフィール (${row.candidate_name} 様)】`,
      `${headline}`,
      `専門領域: ${specialties}`,
      `希望年収: ${desired}`,
      inProgress ? `現在の進行状況: ${inProgress}` : ``,
      ``,
      `【親和性が高いと判断する理由】`,
      reasons || `・[ご担当者様、ここに自分の言葉で 2-3 点お書きください]`,
      ``,
      `[補足: 御社の最近の動向や、候補者の追加情報があればここに 1-2 行]`,
      ``,
      `ぜひ一度、オンラインで 30 分ほどお話させていただけませんでしょうか。`,
      `面談機会を頂けましたら、職務経歴の詳細もお送りさせていただきます。`,
      ``,
      `ご検討よろしくお願いいたします。`,
      ``,
      `—— Wheels Up RA / [氏名]`,
    ].filter(Boolean).join("\n");
  }

  if (kind === "followup") {
    return [
      `${row.company_name} 採用ご担当者様`,
      ``,
      `先日 ${row.candidate_name} 様のご紹介でご連絡を差し上げました Wheels Up [氏名] です。`,
      `その後ご検討状況はいかがでしょうか。`,
      ``,
      `改めて、本候補者の特に魅力に感じる点を 1 点だけ挙げさせていただきます:`,
      `・[ここに自分の言葉で 1 点 - 候補者の数字や具体実績]`,
      ``,
      `もしご返信が難しいようでしたら、お見送りのご一報だけでも頂けますと幸いです。`,
      `(他案件のご紹介機会にも備えさせていただきます)`,
      ``,
      `お忙しいところ恐縮ですが、ご一報お待ちしております。`,
      ``,
      `—— Wheels Up RA / [氏名]`,
    ].join("\n");
  }

  // casual
  return [
    `${row.company_name} ご担当者様`,
    ``,
    `Wheels Up [氏名] と申します。`,
    `御社の「${row.job_title}」について、面白い候補者をお預かりしていますので、`,
    `気軽にお話しできる機会いただけませんでしょうか。`,
    ``,
    `候補者: ${row.candidate_name} 様 (${headline})`,
    `親和性: ${(row.reasons ?? []).slice(0, 2).join(" / ") || "[要記載]"}`,
    ``,
    `お忙しいところ恐縮ですが、15 分でも構いません。`,
    ``,
    `—— Wheels Up RA / [氏名]`,
  ].join("\n");
}
