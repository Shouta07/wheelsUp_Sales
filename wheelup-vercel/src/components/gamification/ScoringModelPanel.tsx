/**
 * 採点モデル（小林の流派）の設計を可視化するパネル（リーダー画面用）。
 * 小林 FB「そもそも小林のモデルがどのような設計になっているのかを小林の画面で表せるように」。
 *
 * ここに表示する内容は api/meetings/index.ts の採点プロンプト内ルーブリックのミラー。
 * ルーブリックを変えたら両方を更新する。
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getLeaderStyle, extractLeaderStyle, type LeaderStyleAxis } from "../../api/client";

const AX_LABEL: Record<string, string> = { needs: "ニーズ", proposal: "提案", trust: "信頼", closing: "前進", intel: "情報" };

function LeaderStyleSection() {
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const { data, refetch } = useQuery({
    queryKey: ["leader-style"],
    queryFn: getLeaderStyle,
  });
  const style: LeaderStyleAxis[] = data?.style ?? [];

  const run = async () => {
    setRunning(true); setMsg(null);
    try {
      const r = await extractLeaderStyle();
      setMsg(`✅ ${r.source_meetings} 件から小林の流儀を抽出しました。次回以降の採点に反映されます。`);
      await refetch();
    } catch (e) {
      setMsg(`❌ ${(e as Error).message}`);
    } finally { setRunning(false); }
  };

  return (
    <div className="rounded-xl border-2 border-[#FF9600] bg-[#fff7ed] p-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[12px] font-extrabold text-[#cc7800]">🥇 小林の流儀（18件のデータから抽出）</span>
        <button
          onClick={run}
          disabled={running}
          className="shrink-0 text-[11px] font-extrabold px-3 py-1.5 rounded-xl text-white disabled:opacity-40"
          style={{ backgroundColor: "#FF9600", borderBottom: "2px solid #cc7800" }}
        >
          {running ? "抽出中…(~30秒)" : style.length > 0 ? "🔄 再抽出" : "▶ 流儀を抽出"}
        </button>
      </div>
      <p className="text-[10px] font-bold text-[#996600] leading-relaxed">
        小林さんの面談から「繰り返し現れる強い型・決め台詞」を AI が抽出し、採点の判断軸に上乗せします。
        （手書きの基準＝土台、これ＝小林さん実データの上書き）
      </p>
      {msg && <p className="text-[10px] font-bold mt-1.5 text-[#cc7800]">{msg}</p>}
      {data?.generated_at && (
        <p className="text-[9px] text-[#afafaf] mt-1">最終抽出: {new Date(data.generated_at).toLocaleString("ja-JP")}</p>
      )}

      {style.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {style.map((s) => (
            <div key={s.axis} className="rounded-lg bg-white border border-[#f0d9b0] p-2">
              <div className="text-[10px] font-extrabold text-[#cc7800] mb-0.5">【{AX_LABEL[s.axis] || s.axis}】</div>
              {s.strong_behaviors?.length > 0 && (
                <ul className="space-y-0.5 mb-1">
                  {s.strong_behaviors.map((b, i) => (
                    <li key={i} className="text-[10px] font-bold text-[#4b4b4b] leading-relaxed">・{b}</li>
                  ))}
                </ul>
              )}
              {s.signature_phrases?.length > 0 && (
                <p className="text-[10px] text-[#777] leading-relaxed">
                  決め台詞: {s.signature_phrases.map((p) => `「${p}」`).join(" / ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      {style.length === 0 && (
        <p className="text-[10px] font-bold text-[#996600] mt-1.5">まだ抽出していません。「▶ 流儀を抽出」を押すと、小林さんの面談から型を取り出します。</p>
      )}
    </div>
  );
}

type AxisModel = {
  key: string;
  label: string;
  color: string;
  summary: string;     // この軸が測るもの
  full: string;        // 10点(満点)の条件
  low: string;         // 低評価になるパターン
};

const AXES: AxisModel[] = [
  {
    key: "needs", label: "ニーズ深掘り", color: "#1CB0F6",
    summary: "発言の奥の真因や、本人が気づいていない盲点まで引き出せたか",
    full: "真因を3層以上掘る ＋ 候補者が気づいていない選択肢/盲点を発見して投げかけた（例:「現職に内勤異動の道は？」「残留交渉は？」）",
    low: "「なぜ」を1-2回聞くが盲点発見なし／一方的に話す・話を遮る",
  },
  {
    key: "proposal", label: "提案力・戦略", color: "#58CC02",
    summary: "単発の企業提示でなく、二軸（安全+挑戦）や長期キャリアを踏まえた戦略提案ができたか",
    full: "具体企業2社以上 ＋ セーフティ枠/挑戦枠の二軸提案 ＋「5年後こうなる」の長期キャリア視点",
    low: "単発の企業提示のみ・戦略性なし／抽象論（「不動産業界どうですか」）",
  },
  {
    key: "trust", label: "信頼構築", color: "#CE82FF",
    summary: "業界知識を示すだけでなく、厳しい現実を率直に伝え、感情に寄り添えたか",
    full: "業界構造3つ以上 ＋「これは構造的に難しい」と率直に厳しい現実を伝える勇気 ＋ 不安/家庭事情への共感",
    low: "一般論レベル・業界知識の浅さ／上から目線・エンパシーゼロ",
  },
  {
    key: "closing", label: "前進・意思決定支援", color: "#FF9600",
    summary: "押し売りでなく、本人が納得して具体的な次の一歩を約束できたか",
    full: "本人が選べる材料を整理（メリデメ比較）＋ 具体的期限 ＋ 具体的アクションを相互合意",
    low: "「またご連絡します」程度の曖昧な約束／急かして温度感を下げた",
  },
  {
    key: "intel", label: "情報網羅", color: "#FF4B4B",
    summary: "他社状況だけでなく、意思決定に関わる全員（家族・配偶者・上司）を把握できたか",
    full: "他社エージェント名 ＋ 選考フェーズ ＋ 家族/配偶者の意向 ＋ 温度感 ＋ 転職時期/制約 の5要素すべて",
    low: "「他にも見てる」「家族と相談」程度／競合状況を一切聞かない",
  },
];

export default function ScoringModelPanel() {
  return (
    <details className="rounded-2xl bg-white border-2 border-[#e5e5e5] p-4 mb-4">
      <summary className="cursor-pointer select-none flex items-center justify-between">
        <span className="text-base font-black text-[#4b4b4b]">📐 採点モデル（小林の流派）</span>
        <span className="text-[10px] font-bold text-[#afafaf]">クリックで開く</span>
      </summary>

      <div className="mt-3 space-y-3">
        {/* 設計思想 */}
        <div className="rounded-xl bg-[#f7f9ff] border border-[#dde6ff] p-3">
          <p className="text-[11px] font-extrabold text-duo-blue mb-1">採点の考え方（絶対基準）</p>
          <ul className="space-y-1 text-[11px] font-bold text-[#4b4b4b] leading-relaxed">
            <li>・ 5 軸を各 0〜10 点で評価（満点 50 点）。キャリアコンサルタントとしての能力・スタンスを測る。</li>
            <li>・「リーダーに似ているか」ではなく、<b>下記ルーブリックの条件を満たした事実があるか</b>で判定。</li>
            <li>・ 和やか・丁寧・長い等の<b>印象では加点しない</b>。淡々とした面談でも条件を満たせば高得点。</li>
            <li>・ 採点は本人（議事録の「あなた」＝担当者）の発言のみが対象。同席者の発言は除外。</li>
          </ul>
        </div>

        {/* 小林の流儀 (18件から抽出してルーブリックを補強) */}
        <LeaderStyleSection />

        {/* 5 軸ルーブリック */}
        {AXES.map((a) => (
          <div key={a.key} className="rounded-xl border border-[#eee] overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2" style={{ backgroundColor: a.color + "12" }}>
              <span className="text-[11px] font-extrabold px-1.5 py-0.5 rounded" style={{ backgroundColor: a.color + "25", color: a.color }}>
                {a.label}
              </span>
              <span className="text-[10px] font-bold text-[#777]">{a.summary}</span>
            </div>
            <div className="p-3 space-y-1.5">
              <div className="flex items-start gap-1.5">
                <span className="shrink-0 text-[10px] font-extrabold text-green-700 bg-green-50 rounded px-1 mt-[1px]">満点 10</span>
                <p className="text-[11px] font-bold text-[#4b4b4b] leading-relaxed">{a.full}</p>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="shrink-0 text-[10px] font-extrabold text-red-700 bg-red-50 rounded px-1 mt-[1px]">低評価</span>
                <p className="text-[11px] font-bold text-[#777] leading-relaxed">{a.low}</p>
              </div>
            </div>
          </div>
        ))}

        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
          <p className="text-[10px] font-bold text-amber-900 leading-relaxed">
            ⓘ <b>この評価基準（5軸の条件）は固定で定義したものです。</b>建築業界の人材紹介の定石をもとに作っています（AI が18件の面談から自動生成したものではありません）。
          </p>
          <p className="text-[10px] font-bold text-amber-800 leading-relaxed mt-1">
            小林さんの面談・「👍/👎」の登録・「📌 手動の観察」は、AI が採点するときの<b>お手本（参照例）</b>として使われ、点数のブレを小林さんの感覚に近づける役割です。基準そのものを書き換えているわけではありません。
            基準を直したい場合は、ここの文言を変更すれば AI の採点も変わります。
          </p>
        </div>
      </div>
    </details>
  );
}
