/**
 * 軸別学習リソース — 面談スコアの弱点軸に応じて教材URLを返す。
 * 本番Supabase運用で `meeting_transcripts.score_data.learning_resources` に保存される。
 *
 * 教材は小林プレイブック (URLなし) と、外部記事/動画 (URLあり) の混成。
 * Geminiには軸スコアのみ生成させ、教材選定はこのテーブルから決定的に行う
 * （URL幻覚・コスト・スコア毎の安定性のため）。
 */

export type LearningResource = {
  axis: "needs" | "proposal" | "trust" | "closing" | "intel";
  title: string;
  description: string;
  playbook_situation?: string;
  url?: string;
  source_type: "video" | "article" | "playbook";
  source_name: string;
};

type AxisKey = LearningResource["axis"];

const AXIS_LEARNING: Record<AxisKey, Omit<LearningResource, "axis">[]> = {
  needs: [
    { title: "本音の深掘りテクニック", description: "「5年後どうなっていたいですか？」「それは会社の問題？業界の構造？」— 未来視点と構造視点で候補者が言語化できていない不満を引き出す", playbook_situation: "候補者のキャリア方向性が定まっていない時", source_type: "playbook", source_name: "小林プレイブック" },
    { title: "求職者面談の流れ7ステップ", description: "現在→未来→過去の順でヒアリングすることで、候補者の本音を自然に引き出す面談フロー。ヒアリングシート付き", playbook_situation: "候補者のキャリア方向性が定まっていない時", url: "https://www.taqnoblog.com/careerinterview/", source_type: "article", source_name: "たくのブログ" },
    { title: "面談で求職者の魅力を引き出すコツ", description: "キャリアアドバイザーが面談時に本音を引き出すための質問テクニックと傾聴のポイント解説", playbook_situation: "候補者が転職理由を言語化できていない時", url: "https://www.dispa.matchingood.co.jp/tips/2592", source_type: "article", source_name: "DiSPA!" },
    { title: "来談者中心カウンセリング手法", description: "人材紹介会社向け：候補者主体の面談で信頼を構築しながらニーズを把握する方法論", playbook_situation: "候補者の話が表面的で本音に辿り着けない時", url: "https://www.paopao-career.com/career-consultant/person-centered-approach/", source_type: "article", source_name: "PaoPaoキャリア" },
    { title: "営業ヒアリングのコツ — SPIN話法", description: "状況質問→問題質問→示唆質問→解決質問の4ステップで課題の本質を引き出すフレームワーク", playbook_situation: "候補者が漠然とした不満しか語れない時", url: "https://mazrica.com/product/senseslab/sales/sales-hearing", source_type: "article", source_name: "Mazrica Sales" },
  ],
  proposal: [
    { title: "2段階説法", description: "①働く環境下をどう整えるか→②その上で業界を選ぶ。候補者が自分で選ぶプロセスを支援する（河原様パターン）", playbook_situation: "ゼネコン経験者が方向性を決めきれず複数エージェントを渡り歩いている時", source_type: "playbook", source_name: "小林プレイブック" },
    { title: "成果を出す提案営業のコツ", description: "「それホントですか？」の視点 — お客様の言葉を鵜呑みにせず真意を引き出し、仮説立てで提案力を高める方法", playbook_situation: "候補者のキャリア方向性が定まっていない時", url: "https://hiroshi-sasada.com/blog/sale-knowhow5/", source_type: "article", source_name: "営業ハック" },
    { title: "提案力とは？必要なスキルとトレーニング方法", description: "提案力を構成する4つの能力（ヒアリング力・相手に合わせる力・予測力・プレゼン力）を体系的に鍛える方法", playbook_situation: "候補者に合わせた具体的な提案ができない時", url: "https://www.ailead.app/blog/proposal-power", source_type: "article", source_name: "ailead" },
    { title: "人材紹介営業で成果を出すコツ", description: "「今採用していますか」ではなく仮説立て＆提案。業界トレンドを加味した提案で企業の信頼を得る営業手法", playbook_situation: "候補者が具体企業をイメージできていない時", url: "https://roomsofknowledge.com/recruitment-sales-tips/", source_type: "article", source_name: "ナレッジルーム" },
  ],
  trust: [
    { title: "業界構造の分解説明", description: "デベ・CM・事業会社・不動産管理会社の立場と責任の違いを構造的に説明。「立場によって追われ方が変わる」（河原様パターン）", playbook_situation: "候補者の不満が会社固有か構造的かわからない時", source_type: "playbook", source_name: "小林プレイブック" },
    { title: "ラポール形成の必勝テクニック", description: "ミラーリング・ペーシング・バックトラッキングの3テクニックで初対面から信頼関係を構築する方法", playbook_situation: "初回面談で候補者との距離が縮まらない時", url: "https://www.youtube.com/watch?v=P5E2L0FFzVs", source_type: "video", source_name: "YouTube" },
    { title: "たった一言で信頼関係を築く術", description: "ラポール構築の実践テクニック。営業・面談で使える具体的な一言フレーズを解説", playbook_situation: "候補者が心を開いてくれない時", url: "https://www.youtube.com/watch?v=M3YcN0YIkU4", source_type: "video", source_name: "YouTube" },
    { title: "初対面3分で信頼をつくる雑談・共通点・質問術", description: "人は会って3秒〜3分で印象が決まる。売り込みよりまず関係づくりを優先するラポール形成の極意", playbook_situation: "面談の導入部分で場が固い時", url: "https://hiroshi-sasada.com/blog/rapport-3/", source_type: "article", source_name: "営業ハック" },
    { title: "施工管理のリアル完全解説", description: "施工管理の給料・仕事内容・キャリアパスを網羅的に解説。候補者との会話で業界知見を示すための基礎知識", playbook_situation: "業界特有の話題で信頼を構築したい時", url: "https://www.youtube.com/watch?v=I4Uc5hT-Lh0", source_type: "video", source_name: "YouTube" },
  ],
  closing: [
    { title: "期限＋アクション＋接点の三点セット", description: "「来週水曜までに3件送ります。金曜16時に電話します」— 1文で次の接点を確定させる", playbook_situation: "面談終盤の次回アクション設定", source_type: "playbook", source_name: "小林プレイブック" },
    { title: "テストクロージングの極意", description: "元キーエンスNo.1営業が解説。商談中に小さなYesを積み重ね、最終クロージングの成約率を飛躍的に高める方法", playbook_situation: "面談終盤で候補者の温度感が読めない時", url: "https://www.youtube.com/watch?v=e_5dM0Ai-Sc", source_type: "video", source_name: "YouTube" },
    { title: "今すぐ使えるクロージングテクニック8選", description: "アサンプションクロージング・選択肢クロージング・期限クロージングなど、状況別に使い分けるテクニック集", playbook_situation: "候補者の決断を後押ししたい時", url: "https://keywordmap.jp/academy/closing-techniques/", source_type: "article", source_name: "Keywordmap Academy" },
    { title: "営業クロージングの流れとコツ", description: "クロージングは商談の最後だけでなく、商談全体を通じて行う。受注前に決まっている意思決定プロセスの理解", playbook_situation: "成約率を上げたい時", url: "https://chikyu.net/column/salesclosing/", source_type: "article", source_name: "GENIEE SFA/CRM" },
  ],
  intel: [
    { title: "年収内訳の構造把握", description: "「残業代込みと基本給のみでは比較が全く変わります」— 表面上の年収ではなく構造を正確に把握する（河原様パターン）", playbook_situation: "年収・待遇に対する期待値が市場と乖離している時", source_type: "playbook", source_name: "小林プレイブック" },
    { title: "営業フレームワーク10選 — BANT分析", description: "予算・決裁権・ニーズ・導入時期の4軸で情報を整理。人材紹介の面談に応用して候補者の状況を網羅的に把握する", playbook_situation: "候補者の転職条件を体系的に把握したい時", url: "https://project-facilitator.com/btob-sales-frameworks/", source_type: "article", source_name: "Project Facilitator" },
    { title: "競合他社の情報収集方法7選", description: "Web・SNS・口コミ・業界レポートを組み合わせた情報収集術。他社エージェントの動向を把握して差別化する", playbook_situation: "候補者が他社エージェントと並行している時", url: "https://espers.co.jp/column/17811/", source_type: "article", source_name: "Espers" },
    { title: "営業ヒアリングのコツとフレームワーク4選", description: "事前準備から当日の質問設計まで、候補者から必要な情報を漏れなく引き出すヒアリング術", playbook_situation: "情報の抜け漏れを防ぎたい時", url: "https://www.innovation.co.jp/urumo/hearing_flow/", source_type: "article", source_name: "urumo" },
  ],
};

/**
 * 軸スコア (0-10) を受け取り、弱い軸 (score < 8) に対して教材を返す。
 * 1軸あたり 2 教材、合計 6 教材まで。
 * リーダーパターン (playbook) を最優先、次に動画、最後に記事の順で並べる。
 */
export function generateLearningResources(
  scores: Partial<Record<AxisKey, number>>,
): LearningResource[] {
  const out: LearningResource[] = [];
  const sorted = (Object.entries(scores) as [AxisKey, number][])
    .filter(([, v]) => typeof v === "number")
    .sort((a, b) => a[1] - b[1]);

  for (const [axis, score] of sorted) {
    if (score >= 8) continue;
    if (out.length >= 6) break;
    const pool = AXIS_LEARNING[axis] ?? [];
    const ordered = [...pool].sort((a, b) => rank(a.source_type) - rank(b.source_type));
    for (const item of ordered.slice(0, 2)) {
      out.push({ axis, ...item });
      if (out.length >= 6) break;
    }
  }
  return out;
}

function rank(t: LearningResource["source_type"]): number {
  return t === "playbook" ? 0 : t === "video" ? 1 : 2;
}
