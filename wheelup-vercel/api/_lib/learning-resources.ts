// 5 軸ごとの静的学習リソース。
// Gemini に URL を出させるとハルシネーションするので、信頼できる外部リソースだけを手動で登録する。
// 採点時、点数の低い 2 軸の resources を結果に添付する。
// 追加・差し替えはここだけ。

export type Axis = "needs" | "proposal" | "trust" | "closing" | "intel";

export interface LearningResource {
  axis: Axis;
  title: string;
  description: string;
  url?: string;
  source_type: "article" | "book" | "video" | "playbook";
}

const RESOURCES: LearningResource[] = [
  // --- needs: ニーズ深掘り ---
  {
    axis: "needs",
    title: "「なぜ転職するのか」を 3 層深掘りする質問の型",
    description: "表層理由 → その背景 → 本音の感情、と 3 段階で掘ると候補者の真のニーズが見える。",
    source_type: "playbook",
  },
  {
    axis: "needs",
    title: "オープンクエスチョンで本音を引き出す技法",
    description: "「なぜ」「どんな時に」「具体的には」を多用し、Yes/No 質問を避ける。",
    url: "https://www.businessinsider.jp/post-100867",
    source_type: "article",
  },
  // --- proposal: 提案力 ---
  {
    axis: "proposal",
    title: "建築業界の主要プレイヤーマッピング",
    description: "ゼネコン・ハウスメーカー・デベ・CM・設計事務所の年収帯と特徴を頭に入れる。",
    source_type: "playbook",
  },
  {
    axis: "proposal",
    title: "FAB (Feature-Advantage-Benefit) で求人を提案する",
    description: "求人の特徴 → 候補者にとってのメリット → 具体的な状況改善、と橋渡しする。",
    url: "https://blog.hubspot.jp/sales/fab",
    source_type: "article",
  },
  // --- trust: 信頼構築 ---
  {
    axis: "trust",
    title: "正直に「無理なものは無理」と伝える勇気",
    description: "市場の現実 (年収帯・難易度) を率直に伝えることが長期の信頼につながる。",
    source_type: "playbook",
  },
  {
    axis: "trust",
    title: "建築業界の専門用語・キャリアパス基礎知識",
    description: "施工管理・設計・PM・CM 等の役割と転職市場での評価ポイントを押さえる。",
    source_type: "playbook",
  },
  // --- closing: クロージング ---
  {
    axis: "closing",
    title: "「いつまでに何を」を必ず明文化する",
    description: "面談終了時に \"水曜までに求人3件送る\" のような具体的な期限とアクションを言語化。",
    source_type: "playbook",
  },
  {
    axis: "closing",
    title: "SPIN セリング: 仮クロージングの活用",
    description: "「もし条件が合えば、今月中の面接受けられそうですか？」で温度感を測る。",
    url: "https://www.salesforce.com/jp/resources/articles/sales/spin-selling/",
    source_type: "article",
  },
  // --- intel: 情報収集 ---
  {
    axis: "intel",
    title: "他社エージェントの併用状況を必ず聞く",
    description: "並行 N 社・選考フェーズ・温度感を把握すると、こちらの戦略が立てやすい。",
    source_type: "playbook",
  },
  {
    axis: "intel",
    title: "意思決定者と意思決定プロセスを確認する",
    description: "家族・配偶者の意向、上司への切り出しタイミング、内定後の意思決定スピードを聞く。",
    source_type: "playbook",
  },
];

// 採点結果の scores から弱い軸 (≤ 6) を上位 2 つ取り、関連リソースを 1 軸あたり 1 件返す。
export function pickLearningResources(scores: Record<string, number>): LearningResource[] {
  const sorted = (Object.entries(scores) as [Axis, number][])
    .filter(([, v]) => typeof v === "number")
    .sort((a, b) => a[1] - b[1])
    .slice(0, 2)
    .map(([axis]) => axis);

  return sorted
    .map((axis) => RESOURCES.find((r) => r.axis === axis))
    .filter((r): r is LearningResource => !!r);
}
