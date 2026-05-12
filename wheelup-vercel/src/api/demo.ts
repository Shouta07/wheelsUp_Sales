import type { MeetingTranscript, MeetingScore, PlaybookEntry } from "./client";

let meetings: MeetingTranscript[] = [];
let idCounter = 1;

function nextId(): string {
  return `demo-${idCounter++}`;
}

// --- 教師データから抽出したスコアリングロジック ---
// 小林リーダーの実面談パターンに基づくキーワード重み付け

const NEEDS_KEYWORDS_STRONG = [
  "転職理由", "本音", "なぜ", "動機", "不満", "悩み", "将来", "キャリア",
  "5年後", "10年後", "ビジョン", "やりがい", "成長", "目指す",
  "どうなりたい", "理想", "方向性", "何がしたい",
];
const NEEDS_KEYWORDS_WEAK = [
  "希望", "課題", "理由", "環境", "ミスマッチ", "合わない",
  "残業", "年収", "条件", "給与", "待遇",
];

const PROPOSAL_KEYWORDS_STRONG = [
  "ご紹介", "提案", "ポジション", "求人", "案件", "企業様",
  "おすすめ", "マッチ", "適正", "市場価値", "相場",
  "こういう会社", "検討できれば",
];
const PROPOSAL_KEYWORDS_WEAK = [
  "紹介", "会社", "企業", "選択肢", "可能性",
];

const TRUST_KEYWORDS_STRONG = [
  "業界", "市場", "ゼネコン", "デベロッパー", "施工管理", "建築士",
  "設計事務所", "ビルディングタイプ", "RC", "S造", "木造",
  "資格", "1級", "2級", "一級", "二級", "技術者",
  "現場", "実務", "経験年数", "プロジェクト",
  "データセンター", "マンション", "オフィスビル", "商業施設",
];
const TRUST_KEYWORDS_WEAK = [
  "経験", "実績", "スキル", "知識", "専門",
];

const CLOSING_KEYWORDS_STRONG = [
  "来週", "今週中", "水曜まで", "金曜に", "月曜に",
  "いつまでに", "期限", "次回", "スケジュール",
  "LINE", "お電話", "ご連絡", "フォローアップ",
  "履歴書", "職務経歴書", "ポートフォリオ",
  "求人をお送り", "件お送り", "件ご紹介",
];
const CLOSING_KEYWORDS_WEAK = [
  "連絡", "アクション", "準備", "送る", "送り",
];

const INTEL_KEYWORDS_STRONG = [
  "他社", "他のエージェント", "選考状況", "内定",
  "温度感", "決裁", "年収", "現年収", "希望年収",
  "何社", "何名", "ビズリーチ", "リクルート", "アデコ",
  "退職日", "入社日", "転職時期",
];
const INTEL_KEYWORDS_WEAK = [
  "条件", "状況", "他に", "受けている", "検討",
];

function countKeywordHits(text: string, strong: string[], weak: string[]): { strong: number; weak: number } {
  let s = 0;
  let w = 0;
  for (const kw of strong) if (text.includes(kw)) s++;
  for (const kw of weak) if (text.includes(kw)) w++;
  return { strong: s, weak: w };
}

function axisScore(strongHits: number, weakHits: number, textLength: number): number {
  const lengthBonus = textLength > 3000 ? 1 : textLength > 1000 ? 0.5 : 0;
  const raw = Math.min(10, 3 + strongHits * 1.2 + weakHits * 0.4 + lengthBonus);
  const jitter = (Math.random() - 0.5) * 0.8;
  return Math.max(1, Math.min(10, Math.round(raw + jitter)));
}

function findEvidence(text: string, keywords: string[]): string {
  const sentences = text.split(/[。\n]/).filter((s) => s.trim().length > 10);
  for (const kw of keywords) {
    const found = sentences.find((s) => s.includes(kw));
    if (found) return found.trim().slice(0, 60);
  }
  return "";
}

function scoreFromText(text: string): MeetingScore {
  const needs = countKeywordHits(text, NEEDS_KEYWORDS_STRONG, NEEDS_KEYWORDS_WEAK);
  const proposal = countKeywordHits(text, PROPOSAL_KEYWORDS_STRONG, PROPOSAL_KEYWORDS_WEAK);
  const trust = countKeywordHits(text, TRUST_KEYWORDS_STRONG, TRUST_KEYWORDS_WEAK);
  const closing = countKeywordHits(text, CLOSING_KEYWORDS_STRONG, CLOSING_KEYWORDS_WEAK);
  const intel = countKeywordHits(text, INTEL_KEYWORDS_STRONG, INTEL_KEYWORDS_WEAK);

  const len = text.length;
  const needsScore = axisScore(needs.strong, needs.weak, len);
  const proposalScore = axisScore(proposal.strong, proposal.weak, len);
  const trustScore = axisScore(trust.strong, trust.weak, len);
  const closingScore = axisScore(closing.strong, closing.weak, len);
  const intelScore = axisScore(intel.strong, intel.weak, len);

  const total = needsScore + proposalScore + trustScore + closingScore + intelScore;
  const grade = total >= 40 ? "S" : total >= 35 ? "A" : total >= 28 ? "B" : total >= 20 ? "C" : "D";

  const needsEv = findEvidence(text, NEEDS_KEYWORDS_STRONG);
  const proposalEv = findEvidence(text, PROPOSAL_KEYWORDS_STRONG);
  const trustEv = findEvidence(text, TRUST_KEYWORDS_STRONG);
  const closingEv = findEvidence(text, CLOSING_KEYWORDS_STRONG);
  const intelEv = findEvidence(text, INTEL_KEYWORDS_STRONG);

  return {
    meeting_id: "",
    scores: {
      needs: needsScore,
      proposal: proposalScore,
      trust: trustScore,
      closing: closingScore,
      intel: intelScore,
    },
    total,
    grade,
    evidence: {
      needs: needsEv
        ? `「${needsEv}」と候補者の本音・動機を深掘りしている`
        : "候補者のキャリアビジョンや転職動機への踏み込みが不足",
      proposal: proposalEv
        ? `「${proposalEv}」と具体的な提案・市場情報を提示している`
        : "具体的な企業名や市場価値の提示がなく、一般論にとどまった",
      trust: trustEv
        ? `「${trustEv}」と業界知識を交えた専門的な会話ができている`
        : "建築・不動産業界特有の知見を活かした会話がなかった",
      closing: closingEv
        ? `「${closingEv}」と期限・次回アクションを明確に設定している`
        : "次のアクションが曖昧で具体的な期限設定がない",
      intel: intelEv
        ? `「${intelEv}」と候補者の状況・他社動向を把握できている`
        : "他社選考状況や転職時期・温度感の確認が不足",
    },
    strengths: [
      ...(needsScore >= 7 ? ["候補者の本音・キャリアビジョンを引き出す深掘り力"] : []),
      ...(trustScore >= 7 ? ["建築・不動産業界の専門知識を活かした信頼構築"] : []),
      ...(closingScore >= 7 ? ["具体的な期限・アクション設定によるクロージング"] : []),
      ...(proposalScore >= 7 ? ["候補者に合わせた具体的企業・ポジションの提案"] : []),
      ...(intelScore >= 7 ? ["他社状況・年収相場など的確な情報収集"] : []),
    ].slice(0, 2),
    improvements: [
      ...(closingScore <= 4 ? ["「来週水曜までに3件お送りします」等、期限付きの次回アクションを設定する"] : []),
      ...(intelScore <= 4 ? ["他社エージェントの利用状況・選考状況・温度感を必ず確認する"] : []),
      ...(proposalScore <= 4 ? ["候補者のニーズに合った具体的な企業名・ポジションを2-3件提示する"] : []),
      ...(needsScore <= 4 ? ["「5年後どうなっていたいですか？」等で候補者のキャリアビジョンを深掘りする"] : []),
      ...(trustScore <= 4 ? ["建築業界の市場動向や企業の内情など専門的な情報を会話に織り交ぜる"] : []),
    ].slice(0, 2),
    leader_would: generateLeaderWould(text, {
      needs: needsScore,
      proposal: proposalScore,
      trust: trustScore,
      closing: closingScore,
      intel: intelScore,
    }),
  };
}

function generateLeaderWould(
  text: string,
  scores: Record<string, number>,
): string {
  const weakest = Object.entries(scores).sort((a, b) => a[1] - b[1])[0][0];

  const templates: Record<string, string[]> = {
    needs: [
      "「5年後を想像した時に、今と同じポジションにいる自分はイメージできますか？」と未来視点でキャリアの方向性を深掘りし、候補者自身も気づいていない本音を引き出す。漠然とした不安を具体的なキャリアギャップとして言語化していく。",
      "「今の環境で成長できていると実感できていますか？」と現状への満足度を掘り下げ、転職動機の核心に迫る。候補者が言語化できていない不満やビジョンを一緒に整理していく。",
    ],
    proposal: [
      "「〇〇さんのご経験であれば、例えば島田アセットパートナーさんのような、設計から竣工まで一気通貫で携われるデベロッパーが合いそうです」と、候補者のニーズに合った具体的な企業名と理由をセットで提示する。",
      "「デベロッパーの年収が高いイメージは、実はトップ5の企業が作り上げているもので、中途だと意外とそこまで上がらないケースも多いです。むしろ〇〇系の方が待遇面では有利な場合もあります」と、市場の現実を踏まえた具体的な選択肢を提示する。",
    ],
    trust: [
      "「デベロッパーの業務フローで言うと、土地仕入れの段階でボリューム検討や法規チェックをして、基本設計・実施設計は外注に出していく形です。図面を自分で書くことはなくなりますが、企画段階での法規知識は活きてきます」と、業界の実務を具体的に説明して候補者の理解を深める。",
      "「このエリアだと物件の価格帯はこのレンジで、ブランド力の差で同じ造成地でも1000万近く差がつくことがあります」と、業界内部の知見を共有して専門家としての信頼を構築する。",
    ],
    closing: [
      "「来週水曜までに3件の求人をお送りします。金曜16時に15分だけお電話で感想を聞かせてください。あと、ポートフォリオのご準備もお願いできますか」と、期限＋具体アクション＋次の接点を1文で設定する。",
      "「次回のところでは具体の企業求人をご紹介できればと思います。その前に、目指す方向性—設計の技術を極めるか、発注者側に行くか—をざっくりでいいので整理しておいていただけますか」と、候補者側のアクションも含めた具体的なネクストステップを設定する。",
    ],
    intel: [
      "「他社のエージェントさんとはどのぐらいお話しされましたか？実際に求人を見た中で、ここ面白いなと思った企業はありましたか？」と、競合状況と候補者の反応を同時に把握する。選考が先行している場合は焦らず「決め手は何ですか」と深掘りする。",
      "「再応募の制限がある企業もあるので、前回受けられた企業をお聞きしたいのですが」と、候補者の選考履歴を把握し、紹介可能な企業を正確に絞り込む。",
    ],
  };

  const options = templates[weakest] || templates.needs;
  return options[Math.floor(Math.random() * options.length)];
}

export function demoFetchMeetings(
  _dealId?: string,
  _candidateId?: string,
  consultantName?: string,
  isLeader?: boolean,
): { transcripts: MeetingTranscript[]; total: number } {
  let filtered = meetings;
  if (consultantName) filtered = filtered.filter((m) => m.consultant_name === consultantName);
  if (isLeader === true) filtered = filtered.filter((m) => m.is_leader);
  if (isLeader === false) filtered = filtered.filter((m) => !m.is_leader);
  return { transcripts: filtered.sort((a, b) => b.recorded_at.localeCompare(a.recorded_at)), total: filtered.length };
}

export async function demoCreateMeeting(data: Partial<MeetingTranscript>): Promise<MeetingTranscript> {
  const id = nextId();
  const now = new Date().toISOString();

  const meeting: MeetingTranscript = {
    id,
    deal_id: null,
    candidate_id: null,
    consultant_name: data.consultant_name || null,
    is_leader: data.is_leader || false,
    score_data: null,
    title: data.title || "面談記録",
    transcript_text: data.transcript_text || "",
    summary: null,
    action_items: [],
    key_points: [],
    next_steps: null,
    attendees: [],
    duration_minutes: null,
    source: data.source || "manual",
    recorded_at: now,
    created_at: now,
    updated_at: now,
  };

  meetings.push(meeting);

  if (meeting.transcript_text && meeting.transcript_text.length > 30) {
    setTimeout(() => {
      const score = scoreFromText(meeting.transcript_text);
      score.meeting_id = id;
      meeting.score_data = score;
    }, 2000);
  }

  return meeting;
}

export async function demoScoreMeeting(id: string): Promise<MeetingScore> {
  const meeting = meetings.find((m) => m.id === id);
  if (!meeting) throw new Error("Meeting not found");
  const score = scoreFromText(meeting.transcript_text);
  score.meeting_id = id;
  meeting.score_data = score;
  return score;
}

export async function demoSummarizeMeeting(id: string): Promise<{ summary: string; action_items: string[]; key_points: string[] }> {
  const meeting = meetings.find((m) => m.id === id);
  if (!meeting) throw new Error("Meeting not found");

  const text = meeting.transcript_text;
  const lines = text.split(/[。\n]/).filter((l) => l.trim().length > 5);

  const summary = `この面談では${lines.length > 0 ? lines[0].trim() : "候補者との初回面談"}について議論しました。候補者の現在の状況と転職動機を確認し、今後の進め方について合意しました。`;

  const actionItems = [
    "候補者の希望条件に合う求人を3件選定して送付",
    "来週中にフォローアップの電話を実施",
    "企業側に候補者のスペックを匿名で打診",
  ];

  const keyPoints = lines.slice(0, 3).map((l) => l.trim());

  meeting.summary = summary;
  meeting.action_items = actionItems;
  meeting.key_points = keyPoints;

  return { summary, action_items: actionItems, key_points: keyPoints };
}

// --- 実面談から抽出したプレイブック ---
export async function demoExtractPlaybook(): Promise<{ playbook: PlaybookEntry[]; source_meetings: number; leader_name: string }> {
  return {
    source_meetings: meetings.filter((m) => m.is_leader).length,
    leader_name: "小林",
    playbook: [
      {
        situation: "候補者のキャリア方向性が定まっていない時",
        trigger: "「設計かデベロッパーか迷っている」「まだ自分の中で決まっていない」等、方向性が未定の場合",
        leader_approach: "小林は実際のデベロッパー業務フローを具体的に説明する。「デベロッパーだと土地仕入れのボリューム検討や法規チェックが中心で、図面は外注に出す形です。設計の技術を磨きたいなら遠ざかる部分もあります」と現実を伝え、候補者が判断できる材料を提供する。感覚ではなくファクトで整理を助ける。",
        key_phrases: [
          "発注者側だと図面は書かなくなります",
          "業務フローとしてはこういう形です",
          "技術者として何を大事にしたいですか",
        ],
        avoid: "候補者の希望を否定する。「デベロッパーの方がいいですよ」と一方的に誘導する。",
        success_rate_hint: "具体的な業務フロー説明後に方向性が明確になる確率: 約75%",
      },
      {
        situation: "年収・待遇に対する期待値が市場と乖離している時",
        trigger: "「デベロッパーは年収が高いイメージ」「年収1000万を目指したい」等の発言があった場合",
        leader_approach: "小林は市場の現実をデータで伝える。「デベロッパーの年収が高いイメージはトップ5の企業が作り上げているもので、中途入社だと意外とそこまで上がらないケースが多いです。むしろ設計事務所でない選択肢の方が待遇面で有利な場合もあります」と、イメージと現実のギャップを正直に伝えた上で、実現可能な選択肢を提示する。",
        key_phrases: [
          "市場的にはこのレンジが適正です",
          "中途だと意外とそこまで上がらない",
          "イメージと現実にギャップがあります",
        ],
        avoid: "候補者の希望額をそのまま受け入れる。根拠なく「もっと上を目指しましょう」と言う。",
        success_rate_hint: "市場データ提示後、現実的な条件で納得する確率: 約70%",
      },
      {
        situation: "早期離職リスクがある候補者（在籍1年未満）",
        trigger: "「まだ1年経っていない」「短期で転職を繰り返している」等の場合",
        leader_approach: "小林はリスクを正直に伝えつつ対策を一緒に考える。「1年以上間が空いていないと再応募できない企業もあります。企業側から長期就業できるか見られてしまうので、目指す先がどうかというところを強く握った上で、プロセスとして今の会社にいたと説明できるようにしましょう」と、ポジティブなストーリーの構築を手伝う。",
        key_phrases: [
          "企業様から長期就業できるか見られます",
          "目指す先を明確にした上でプロセスとして説明",
          "再応募制限がある企業もあります",
        ],
        avoid: "短期離職を責める。リスクを伝えずに楽観的な見通しだけ伝える。",
        success_rate_hint: "ストーリー構築支援後、書類通過率が改善する確率: 約60%",
      },
      {
        situation: "候補者が具体企業をイメージできていない時",
        trigger: "「いい話があれば」「特に企業名は浮かんでいない」「探している状態」の場合",
        leader_approach: "小林は候補者のニーズを踏まえて具体的な企業名と理由をセットで提案する。「一気通貫で携わりたいなら、例えば島田アセットパートナーさんはアトリエ系のデベに近くて、自分で設計も書けるポジションです。東京ならこの企業、福岡ならこの企業と選択肢を出せます」と、候補者が比較検討できる材料を複数提示する。",
        key_phrases: [
          "例えばこの企業さんだと",
          "こういう理由で合いそうです",
          "選択肢として3つほどご紹介します",
        ],
        avoid: "「また良いのがあったら連絡します」と曖昧に終わる。候補者任せで提案しない。",
        success_rate_hint: "具体企業を理由付きで提案した場合の応募意欲UP率: 約80%",
      },
      {
        situation: "面談終盤の次回アクション設定",
        trigger: "情報収集が一通り終わり、次のステップを決める場面",
        leader_approach: "小林は期限＋具体アクション＋次の接点を必ず1セットで設定する。「次回のところでは具体の企業求人をご紹介します。その前に方向性をざっくりでいいので整理しておいてください。ポートフォリオの準備もお願いします。LINEでやり取りできればと思うので交換しましょう」と、双方のアクションを明確にして面談を閉じる。",
        key_phrases: [
          "次回は具体の企業求人をご紹介します",
          "それまでにこれを準備してください",
          "LINEで連絡を取りましょう",
        ],
        avoid: "「またいいのがあったら連絡します」と曖昧に終わる。次回の日時やアクションを決めずに面談を閉じる。",
        success_rate_hint: "期限付きアクション設定後の次回面談実施率: 約90%",
      },
    ],
  };
}

// --- 実面談トランスクリプトを基にした教師データ ---
export function seedDemoData() {
  if (meetings.length > 0) return;

  const leaderMeetings = [
    {
      title: "小林+村上: 福元一成様（施工管理・RC経験7年）",
      text: "福元一成様との面談。村上が初期ヒアリングを実施し、小林がキャリア戦略を提案。候補者は施工管理でRC造経験7年、年収485万、3月末に離職済み。転職理由はコミュニケーション面でのフィードバックを受けて自信喪失した部分がある。小林は候補者の経験を業界水準と照らし合わせ「RC造7年の経験であれば施工管理として市場価値は十分ある。年収500万台は狙えるレンジ」と市場価値を提示。5年後のキャリアビジョンについて深掘りし、候補者の本音を引き出した。具体的な企業として中堅ゼネコンの施工管理ポジションを複数紹介。他社エージェントの利用状況を確認し、来週水曜までに求人3件をLINEで送る約束。次回面談を来週金曜に設定。",
    },
    {
      title: "小林+安藤: komine wataru様（イオンネクスト建設部）",
      text: "komine wataru様との面談。安藤が初期ヒアリング、小林がキャリア戦略と業界知識を提供。候補者はイオンネクスト建設部で発注者ポジション。年収850万、データセンター案件を希望。180億規模の物件を担当した経験あり。小林は「データセンターは今後も需要が拡大する分野で、この経験年数と実績であれば更に上のポジションも十分狙える」と市場分析を提示。デベロッパーとゼネコンの両面からキャリアパスを具体的に説明。候補者の転職動機を深掘りし、本音として「より大規模な案件に携わりたい」「技術的な成長を求めている」というビジョンを引き出した。選考状況として他社エージェントは1社利用中であることを確認。データセンター系の案件を持つ企業を3社ピックアップし、来週中に詳細情報を共有する約束。LINE交換済み。",
    },
    {
      title: "小林+安藤: 新井雅也様（東急建設→デベロッパー希望）",
      text: "新井雅也様との面談。安藤が状況確認、小林がキャリアの方向性を整理。候補者は東急建設からトレンドデザインへ転職。1級建築士の学科試験に合格。デベロッパー側へのキャリアチェンジを希望。年収は500-550万のレンジ。小林は「デベロッパーの年収が高いイメージは実はトップ5の企業が作り上げているもので、中途入社だと意外とそこまで上がらないケースが多い」と市場の現実を正直に伝達。「設計事務所ではない選択肢でも待遇面では十分叶う可能性がある」と視野を広げる提案。候補者の転職理由を深掘りし、技術者としての成長志向が強いことを把握。一級建築士の資格取得に向けた動機と将来のキャリアビジョンについて議論。他社での選考状況と温度感を確認し、まだ初期段階であることを把握。具体的な企業紹介は次回面談で行う予定として、来週までに方向性を整理しておくよう依頼。",
    },
    {
      title: "小林+西村: 角陸斗様（設計一気通貫・一級建築士）",
      text: "角陸斗様との面談。西村が初期ヒアリングを実施、小林が業界知識とキャリア戦略を提供。候補者はプランテック在籍の一級建築士。年収620万。東京・福岡の二拠点で検討中。転職理由は「設計の一気通貫に携わりたいが、現職では基本設計までで実施設計以降はゼネコンに投げてしまう。成長できる環境にない」という本音を把握。小林はデベロッパーの業務フローを具体的に説明。「発注者側だと土地仕入れのボリューム検討や法規チェックが中心で、図面を自分で書くことはなくなる。技術者としての成長志向が強いなら遠ざかる部分もある」と現実を提示。在籍1年未満の早期離職リスクについても「企業から長期就業できるか見られるので、目指す先を明確にしてプロセスとして説明できるようにしましょう」とアドバイス。具体企業として島田アセットパートナーを紹介。「アトリエ系デベロッパーで設計も書ける。ただしポートフォリオの提出が必要」と実務的な準備事項も提示。アデコ経由で他社1社と並行中であることを確認。次回は具体求人を紹介する予定。",
    },
    {
      title: "小林+西村: 山田喬之様（京阪電鉄不動産・開発職）",
      text: "山田喬之様との面談。西村が初期ヒアリング、小林が市場分析と戦略を提供。候補者は京阪電鉄不動産で戸建て住宅の造成・開発業務。年収650万。積水ハウスから転職して現職。パートナーあり。転職動機は「経済状況を見て早めに動きたい」「取り扱う物件の価格帯を上げたい」。小林は物件価格帯の違いが企業ブランドやビジネスモデルにどう影響するかを具体的に説明。「同じ造成地でもブランド力の差で1000万近い価格差がつく。現職の4000万帯と高額帯では客層も需要構造も変わってくる」と業界知識を展開。戸建てデベロッパーとマンションデベロッパーの両方の選択肢を提示。「野村不動産さんのリノベーション部門は一つの選択肢。東京なら東西さん、関西なら阪急阪神不動産さんのプロジェクトも検討できる」と具体企業名を提案。他社エージェント2社とリクルートの状況を確認。現職でのマンション開発への社内異動という選択肢も含めて議論。来週までに職務経歴書を整備し、求人を3件以上送付する約束。",
    },
  ];

  for (const lm of leaderMeetings) {
    const id = nextId();
    const now = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString();
    const score = scoreFromText(lm.text);
    score.meeting_id = id;
    score.scores.needs = Math.min(10, score.scores.needs + 2);
    score.scores.proposal = Math.min(10, score.scores.proposal + 1);
    score.scores.trust = Math.min(10, score.scores.trust + 1);
    score.scores.closing = Math.min(10, score.scores.closing + 2);
    score.scores.intel = Math.min(10, score.scores.intel + 1);
    score.total = Object.values(score.scores).reduce((a, b) => a + b, 0);
    score.grade = score.total >= 40 ? "S" : score.total >= 35 ? "A" : "B";

    meetings.push({
      id,
      deal_id: null,
      candidate_id: null,
      consultant_name: "小林",
      is_leader: true,
      score_data: score,
      title: lm.title,
      transcript_text: lm.text,
      summary: null,
      action_items: [],
      key_points: [],
      next_steps: null,
      attendees: [],
      duration_minutes: null,
      source: "manual",
      recorded_at: now,
      created_at: now,
      updated_at: now,
    });
  }

  const sampleConsultants = [
    {
      name: "西村",
      title: "西村: 角様（設計事務所・一級建築士）初期ヒアリング",
      text: "角様との初期面談。ビズリーチ経由でコンタクト。現職はプランテック、一級建築士・宅建保有。転職理由は一気通貫で設計に携わりたい。アデコ経由で他社1社と並行中。年収620万、希望は550万以上。東京または福岡で検討中。9月入社を想定、退職告知後3ヶ月の退職日設定あり。資格として建築設備士の取得も検討中。",
    },
    {
      name: "西村",
      title: "西村: 山田様（京阪電鉄不動産・開発職）初期ヒアリング",
      text: "山田様との初期面談。ビズリーチ経由。積水ハウスから京阪電鉄不動産へ転職済み。戸建て住宅の造成・開発を担当。年収650万。転職理由は経済状況を見て早めに動きたい、物件価格帯を上げたい。他社エージェント2社と並行。リクルートエージェントで野村不動産に応募中だが面談未実施で停滞。9月入社希望（ボーナス後）。パートナーあり。関西圏では取引先が多く気が引けるため東京も視野に。",
    },
    {
      name: "辻内",
      title: "辻内: 吉田様（プラント設備・メンテナンス8年）",
      text: "吉田様との面談。プラント設備のメンテナンスで8年の経験。危険物取扱者の資格保有。転職理由は年収アップと出張を減らしたいこと。他社エージェントの利用はなく、情報収集段階。年収は現在480万で600万以上を希望。プラント系の設備管理で転勤なしのポジションを希望。来週木曜までに求人情報を共有する約束。",
    },
    {
      name: "辻内",
      title: "辻内: 山本様（土木現場管理6年・環境コンサル志望）",
      text: "山本様との面談。土木の現場管理で6年の経験。1級土木施工管理技士の資格保有。転職理由は現場から離れたいという本音。環境アセスメントや調査系に興味あり。年収は現在450万で500万台を希望。他社はまだ利用していない。転勤は可能だが、できれば関東希望。来週中に環境コンサル系の求人をリストアップして送付する約束。",
    },
    {
      name: "安藤",
      title: "安藤: 渡辺様（建築設計3年・ディベロッパー志望）",
      text: "渡辺様との面談。建築設計で3年の経験。二級建築士。転職理由は給与の低さと残業。デベロッパー側に行きたいという希望。年収は現在380万で450万以上を目指したい。温度感は高く、来月中には決めたい意向。他社エージェント1社と並行中。来週月曜に求人を3件提案する約束。",
    },
    {
      name: "村上",
      title: "村上: 伊藤様（空調設備施工管理10年・管理職希望）",
      text: "伊藤様との面談。空調設備の施工管理で10年の経験。管工事施工管理技士の資格保有。転職理由はマネジメントポジションへのステップアップ希望。年収は現在520万で600万以上を希望。他社は1社選考中で一次面接通過済み。温度感は高い。来週水曜までに管理職ポジションの案件を5件送付する約束。LINE交換済み。",
    },
  ];

  for (const sc of sampleConsultants) {
    const id = nextId();
    const now = new Date(Date.now() - Math.random() * 5 * 24 * 60 * 60 * 1000).toISOString();
    const score = scoreFromText(sc.text);
    score.meeting_id = id;

    meetings.push({
      id,
      deal_id: null,
      candidate_id: null,
      consultant_name: sc.name,
      is_leader: false,
      score_data: score,
      title: sc.title,
      transcript_text: sc.text,
      summary: null,
      action_items: [],
      key_points: [],
      next_steps: null,
      attendees: [],
      duration_minutes: null,
      source: "manual",
      recorded_at: now,
      created_at: now,
      updated_at: now,
    });
  }
}
