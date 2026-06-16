// 軸ごとの学習リソース（課題改善のための項目別リンク）。
// 西村 FB: 成長グラフより、リーダーとのギャップ + それを埋めるための学習リンクが欲しい。
//   キャリアコンサルタントとして建築業界の業界知識・顧客知識を深める教材も含める。
// MeetingHub（面談カードの各軸末尾）と SkillGapPanel（メンバートップ）の両方が参照する。

export type AxisKey = "needs" | "proposal" | "trust" | "closing" | "intel";

export interface LearningLink {
  title: string;
  note: string;
  url?: string;
  kind: "skill" | "industry"; // skill=面談技術 / industry=業界・顧客知識
}

export const AXIS_LEARNING: Record<AxisKey, LearningLink[]> = {
  needs: [
    {
      title: "「なぜ転職か」を3層深掘りする質問の型",
      note: "表層理由→背景→本音の感情まで3段で掘る。「なぜ」「どんな時に」「具体的には」を多用しYes/No質問を避ける。",
      url: "https://www.businessinsider.jp/post-100867",
      kind: "skill",
    },
    {
      title: "本人が気づいていない盲点を投げかける",
      note: "「現職に内勤異動の道は？」「残留交渉は？」など、転職以外の選択肢も提示して真のニーズを浮かび上がらせる。",
      kind: "skill",
    },
  ],
  proposal: [
    {
      title: "建築業界の主要プレイヤーマッピング",
      note: "ゼネコン／ハウスメーカー／デベロッパー／CM／設計事務所／事業会社の年収帯・特徴・キャリアパスを頭に入れる。",
      kind: "industry",
    },
    {
      title: "FAB（特徴→利点→便益）で求人を提案する",
      note: "求人の特徴→候補者にとっての利点→具体的な状況改善、と橋渡し。セーフティ枠/挑戦枠の二軸で整理。",
      url: "https://blog.hubspot.jp/sales/fab",
      kind: "skill",
    },
  ],
  trust: [
    {
      title: "建築業界の業界知識・キャリアパス基礎",
      note: "施工管理／設計／PM／CM／発注者側の役割と転職市場での評価ポイント、年収構造、出向・転勤の実態を押さえる。",
      kind: "industry",
    },
    {
      title: "厳しい現実を率直に伝える勇気",
      note: "「これは構造的に難しい」と市場の現実（年収帯・難易度）を率直に伝える。共感とセットで長期の信頼につながる。",
      kind: "skill",
    },
  ],
  closing: [
    {
      title: "期限＋アクションを必ず明文化する",
      note: "「水曜までに求人3件送る／金曜に15分電話」など、期限・具体アクション・次の接点を1文で相互合意する。",
      kind: "skill",
    },
    {
      title: "逆算スケジュールで目線を合わせる",
      note: "入社時期から逆算（内定→退職→入社）して提示。仮クロージング「条件が合えば今月面接できそう？」で温度感を測る。",
      url: "https://www.salesforce.com/jp/resources/articles/sales/spin-selling/",
      kind: "skill",
    },
  ],
  intel: [
    {
      title: "意思決定者・意思決定プロセスを把握する",
      note: "家族／配偶者の意向、上司への切り出し、内定後の意思決定スピード、転職時期の制約まで確認する。",
      kind: "skill",
    },
    {
      title: "競合エージェント状況と年収内訳を聞く",
      note: "並行 N 社・選考フェーズ・温度感を把握。年収は残業代込みか基本給かまで分解して正確に把握する。",
      kind: "industry",
    },
  ],
};
