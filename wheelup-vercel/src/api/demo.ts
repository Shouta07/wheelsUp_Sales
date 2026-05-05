import type { MeetingTranscript, MeetingScore, PlaybookEntry } from "./client";

let meetings: MeetingTranscript[] = [];
let idCounter = 1;

function nextId(): string {
  return `demo-${idCounter++}`;
}

function scoreFromText(text: string): MeetingScore {
  const hasNeeds = /希望|本音|なぜ|理由|動機|課題|不満|悩み/.test(text);
  const hasProposal = /提案|求人|マッチ|紹介|案件|おすすめ/.test(text);
  const hasTrust = /業界|現場|施工管理|資格|経験|実績/.test(text);
  const hasClosing = /来週|いつまで|期限|連絡|次回|アクション/.test(text);
  const hasIntel = /他社|選考|年収|条件|温度感|決裁/.test(text);

  const needs = hasNeeds ? 6 + Math.floor(Math.random() * 3) : 3 + Math.floor(Math.random() * 3);
  const proposal = hasProposal ? 6 + Math.floor(Math.random() * 3) : 3 + Math.floor(Math.random() * 3);
  const trust = hasTrust ? 6 + Math.floor(Math.random() * 3) : 3 + Math.floor(Math.random() * 3);
  const closing = hasClosing ? 6 + Math.floor(Math.random() * 3) : 2 + Math.floor(Math.random() * 3);
  const intel = hasIntel ? 6 + Math.floor(Math.random() * 3) : 3 + Math.floor(Math.random() * 3);

  const total = needs + proposal + trust + closing + intel;
  const grade = total >= 40 ? "S" : total >= 35 ? "A" : total >= 28 ? "B" : total >= 20 ? "C" : "D";

  const lines = text.split(/[。\n]/).filter((l) => l.trim().length > 5);
  const pick = (i: number) => lines[i % lines.length]?.trim() || "";

  return {
    meeting_id: "",
    scores: { needs, proposal, trust, closing, intel },
    total,
    grade,
    evidence: {
      needs: hasNeeds ? `「${pick(0)}」とニーズを掘り下げている` : "候補者の本音に踏み込む質問が少ない",
      proposal: hasProposal ? `「${pick(1)}」と具体的な提案ができている` : "具体的な求人提示がなく、一般論にとどまった",
      trust: hasTrust ? `「${pick(2)}」と業界知識を交えて話せている` : "業界特有の文脈への言及がなかった",
      closing: hasClosing ? `「${pick(3)}」と期限を切れている` : "次のアクションが曖昧で期限が設定されていない",
      intel: hasIntel ? `「${pick(4)}」と情報を引き出せている` : "他社状況や温度感の確認ができていない",
    },
    strengths: [
      ...(needs >= 7 ? ["候補者の本音を引き出す質問力"] : []),
      ...(trust >= 7 ? ["業界知識を活かした信頼構築"] : []),
      ...(closing >= 7 ? ["期限を切ったクロージング"] : []),
    ].slice(0, 2),
    improvements: [
      ...(closing <= 4 ? ["次回アクションに期限を設定する（「来週水曜までに」等）"] : []),
      ...(intel <= 4 ? ["他社選考状況と温度感を必ず確認する"] : []),
      ...(proposal <= 4 ? ["候補者の希望に合った具体的な求人を2-3件提示する"] : []),
    ].slice(0, 2),
    leader_would: "「〇〇さんのご経験で施工管理の現場監督をされていたなら、今後は所長クラスのポジションも十分狙えます。例えば△△建設の案件で、年収は現状維持で上のポジションに就ける求人がありますが、来週木曜までにお話を聞いてみませんか？」と、業界知識＋具体求人＋期限を1文に詰める。",
  };
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

  // Auto-score after 2 seconds (simulates AI processing)
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

export async function demoExtractPlaybook(): Promise<{ playbook: PlaybookEntry[]; source_meetings: number; leader_name: string }> {
  return {
    source_meetings: meetings.filter((m) => m.is_leader).length,
    leader_name: "小林",
    playbook: [
      {
        situation: "候補者の転職動機が曖昧な時",
        trigger: "「なんとなく転職したい」「特に不満はないけど」と言われた場合",
        leader_approach: "「なるほど、今の環境に大きな不満がないのは良いことですね。ただ、5年後を想像した時に今と同じポジションにいる自分はイメージできますか？」と未来視点に切り替える。漠然とした不安を具体的なキャリアギャップとして言語化する。",
        key_phrases: ["5年後を想像すると", "キャリアの天井を感じませんか", "今の環境で学べることは残っていますか"],
        avoid: "「転職すべきです」と一方的に押す。候補者の現状を否定する発言。",
        success_rate_hint: "この切り口で本音が出る確率: 約80%",
      },
      {
        situation: "年収交渉で候補者が弱気な時",
        trigger: "「年収は現状維持でいいです」「あまり高望みしても...」と言われた場合",
        leader_approach: "「田中さんのご経験と資格で、市場的にはこのレンジが適正です」と客観データを提示。候補者が値切る前に市場価値を伝えて、交渉のアンカーを上に置く。",
        key_phrases: ["市場的にはこのレンジ", "同経験年数の方の相場は", "企業側もこの水準は想定しています"],
        avoid: "候補者の希望額をそのまま受け入れる。根拠なく「もっと上を目指しましょう」と言う。",
        success_rate_hint: "適正相場を提示した場合、年収UPで決まる確率: 約65%",
      },
      {
        situation: "他社選考が先行している時",
        trigger: "「実は他社でもう内定が出ていて...」「来週までに返事しないと」と言われた場合",
        leader_approach: "焦らず「それは素晴らしいですね。ちなみにその企業のどこが決め手ですか？」と深掘り。他社の条件を聞いた上で、「一点だけ確認させてください。〇〇の点は大丈夫ですか？」と候補者が気づいていないリスクを指摘し、比較材料を増やす。",
        key_phrases: ["決め手は何ですか", "一点だけ確認させてください", "比較せずに決めると後悔することも"],
        avoid: "他社を悪く言う。「うちの方が絶対いい」と根拠なく主張する。",
        success_rate_hint: "冷静に比較材料を提示した場合、再検討してくれる確率: 約50%",
      },
      {
        situation: "候補者の温度感が低い（情報収集段階）",
        trigger: "「まだ転職は考えてないけど話だけ聞きたい」「いい話があれば」程度の場合",
        leader_approach: "無理に面談を設定しない。「今の市場の面白い動きだけお伝えしますね」と情報提供に徹し、信頼を構築。2週間後に「あの話の続きですが」と具体案件で再アプローチ。",
        key_phrases: ["情報提供だけさせてください", "面白い動きがあるので共有します", "来週あの件の続報をお伝えします"],
        avoid: "初回から「いつまでに転職しますか」��期限を詰める。温度感が低い段階で企業面接を組もうとする。",
        success_rate_hint: "信頼構築後の本格検討移行率: 約40%",
      },
      {
        situation: "面談後のフォローアップ（次回アクション設定）",
        trigger: "面談の終盤、次のステップを決める場面",
        leader_approach: "「来週水曜までに3件の求人をお送りします。金曜16時に15分だけお電話で感想を聞かせてください」と、期限+具体アクション+次の接点を1文で設定。曖昧な「また連絡します」は絶対に避ける。",
        key_phrases: ["来週水曜までに", "金曜に15分だけ", "3件お送りするので優先順位をつけてください"],
        avoid: "「またいいのがあったら連絡します」と曖昧に終わる。次回の日時を決めずに電話を切る。",
        success_rate_hint: "期限を切った場合の次回面談実施率: 約90%",
      },
    ],
  };
}

// Pre-load demo data: leader meetings
export function seedDemoData() {
  if (meetings.length > 0) return;

  const leaderMeetings = [
    {
      title: "小林: 田中様（施工管理→所長候補）",
      text: "田中さんの転職動機は年収アップと役職。施工管理として10年の経験があり、1級土木施工管理技士の資格も持っている。現場でのマネジメント経験も豊富で、所長クラスのポジションを希望。他社も2社受けているが、まだ一次面接の段階とのこと。年収は現在550万だが、650万以上を希望。来週水曜までに求人3件を提案し、金曜に電話で感想を聞く約束。",
    },
    {
      title: "小林: 佐藤様（設計→PM転向）",
      text: "佐藤さんは設計事務所で8年。建築士の資格あり。本音としては設計だけでなくプロジェクト全体を見たい。年収は現状480万で、500万台を目指したい。他社の選考状況はまだ動き始めたばかり。転職の温度感は高く、来月中には決めたい意向。具体的に〇〇建設のPMポジションと△△ハウスの設計主任を提案。来週月曜に企業情報を送り、水曜に面談設定の連絡をする。",
    },
    {
      title: "小林: 高橋様（現場監督のキャリア相談）",
      text: "高橋さんは中堅ゼネコンで現場監督5年目。資格は2級建築施工管理技士。不満は残業の多さと年収（420万）。業界的にはこの経験年数なら500万台も十分狙える。本人は転勤なしを強く希望。他社状況を聞くと、まだ情報収集段階。来週までに転勤なしの案件を5件リストアップし、金曜に電話で優先順位をつける。決裁者は本人のみ。",
    },
  ];

  for (const lm of leaderMeetings) {
    const id = nextId();
    const now = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString();
    const score = scoreFromText(lm.text);
    score.meeting_id = id;
    // Leader scores are higher
    score.scores.needs = Math.min(10, score.scores.needs + 2);
    score.scores.closing = Math.min(10, score.scores.closing + 2);
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

  // Sample consultant meetings for team highlights demo
  const sampleConsultants = [
    {
      name: "西村",
      title: "西村: 鈴木様（電気工事士→設備管理）",
      text: "鈴木さんは電気工事士として7年。第二種電気工事士の資格あり。転職の理由は体力面の不安と将来性。希望は設備管理で年収維持。提案として〇〇ビルメンテナンスの案件を紹介。来週中に履歴書を更新してもらう約束。",
    },
    {
      name: "西村",
      title: "西村: 中村様（営業→施工管理）",
      text: "中村さんは不動産営業5年。資格はなし。動機は手に職をつけたい。年収は下がっても構わないとのこと。未経験歓迎の施工管理求人を3件紹介予定。来週火曜に電話する約束。",
    },
    {
      name: "辻内",
      title: "辻内: 吉田様（設備→プラント）",
      text: "吉田さんはプラント設備のメンテナンス8年目。危険物取扱者の資格持ち。本音は年収アップと出張を減らしたい。他社の選考はまだ受けていない。プラント系の設備管理で年収600万以上の求人を探す。来週木曜までに情報共有。",
    },
    {
      name: "辻内",
      title: "辻内: 山本様（土木→環境コンサル）",
      text: "山本さんは土木の現場管理6年。1級土木施工管理技士の資格あり。本音としては現場から離れたい。環境アセスメントや調査系に興味。年収は500万台を希望。他社はまだ見ていない。来週までに環境コンサル系の求人をリストアップ。",
    },
    {
      name: "安藤",
      title: "安藤: 渡辺様（建築→ディベロッパー）",
      text: "渡辺さんは建築設計3年。二級建築士。不満は給与の低さと残業。ディベロッパー側に行きたい希望あり。年収は現在380万で450万以上を目指したい。温度感は高い。来週月曜に求人3件を提案する。",
    },
    {
      name: "村上",
      title: "村上: 伊藤様（空調設備→管理職）",
      text: "伊藤さんは空調設備の施工管理10年。管工事施工管理技士の資格あり。希望はマネジメントポジション。年収は現在520万で600万以上を希望。他社は1社選考中。来週水曜までに管理職ポジションの案件を5件送る約束。",
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
