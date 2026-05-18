import { useState } from "react";

/**
 * 画面トップに表示する「朝の使い方」案内。
 *
 * 4 ステップを左から右に並べ、各ステップにアンカーリンクを付ける。
 * 「もう分かった」ボタンで localStorage に記録して以降は非表示。
 */
export default function HowToPanel() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("ra_howto_dismissed") === "1";
  });

  if (dismissed) {
    return (
      <button
        onClick={() => {
          localStorage.removeItem("ra_howto_dismissed");
          setDismissed(false);
        }}
        className="mb-3 text-[11px] font-bold text-[#1CB0F6] hover:underline"
      >
        ❓ 使い方を表示
      </button>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-[#1CB0F6]/30 bg-gradient-to-r from-blue-50 to-cyan-50 p-4 mb-3">
      <div className="flex items-center justify-between mb-3">
        <span className="font-black text-[#4b4b4b] text-sm">📖 朝の使い方 (4 ステップ)</span>
        <button
          onClick={() => {
            localStorage.setItem("ra_howto_dismissed", "1");
            setDismissed(true);
          }}
          className="text-[10px] text-[#afafaf] hover:text-[#4b4b4b] font-bold"
        >
          ✕ もう分かった
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
        <Step
          n={1}
          emoji="🤖"
          title="データ集めを開始"
          desc='中央の「▶ 自動でデータを集める」を押す'
          detail="URL補完 → 求人クロール → 候補者マッチ を AI が自動ループ"
        />
        <Step
          n={2}
          emoji="⏰"
          title="フォロー漏れ確認"
          desc="黄色の「フォロー対象」セクションを処理"
          detail="3 日以上前に送信してまだ返信が無い案件をリマインド"
        />
        <Step
          n={3}
          emoji="🎯"
          title="今日のアタック送信"
          desc='「今日のアタック対象」の ✉️ 送信処理 を順に押す'
          detail="テンプレ自動生成 → コピー → フォーム/Gmail 起動 → 送信記録、全自動"
        />
        <Step
          n={4}
          emoji="📋"
          title="進捗チェック"
          desc='「企業一覧」で「未接触」フィルタ → 攻め対象を発掘'
          detail="送信/返信/商談カウントとアプローチ状況を一覧で把握"
        />
      </div>

      <p className="mt-3 text-[10px] text-[#4b4b4b] text-center">
        💡 1 日 10〜20 分の運用で 246 社をローテーション。送信は人がやるが、その他は全部 AI が裏で進めます。
      </p>
    </div>
  );
}

function Step({ n, emoji, title, desc, detail }: {
  n: number;
  emoji: string;
  title: string;
  desc: string;
  detail: string;
}) {
  return (
    <div className="relative rounded-xl bg-white border border-[#e5e5e5] p-3">
      <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-[#1CB0F6] text-white text-xs font-black flex items-center justify-center shadow-sm">
        {n}
      </div>
      <div className="text-2xl mb-1">{emoji}</div>
      <div className="text-xs font-black text-[#4b4b4b]">{title}</div>
      <div className="text-[11px] text-[#4b4b4b] mt-1 leading-snug">{desc}</div>
      <div className="text-[10px] text-[#afafaf] mt-1 leading-snug">{detail}</div>
    </div>
  );
}
