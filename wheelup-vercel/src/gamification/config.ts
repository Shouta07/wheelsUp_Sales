import type { Achievement, DailyQuest, League } from "./types";

export const XP_ACTIONS: Record<string, { xp: number; label: string }> = {
  checklist_item: { xp: 10, label: "チェックリスト完了" },
  phase_complete: { xp: 50, label: "フェーズ完了ボーナス" },
  ai_briefing: { xp: 15, label: "AIブリーフィング生成" },
  meeting_logged: { xp: 30, label: "面談記録" },
  meeting_notes: { xp: 20, label: "面談メモ追加" },
  status_update: { xp: 25, label: "ステータス更新" },
  job_match: { xp: 15, label: "求人マッチング実行" },
  recommendation_created: { xp: 20, label: "推薦案件作成" },
  candidate_placed: { xp: 200, label: "成約！" },
  daily_quest: { xp: 20, label: "デイリークエスト達成" },
  knowledge_view: { xp: 5, label: "業界知識閲覧" },
};

export const LEVEL_THRESHOLDS = [
  0, 50, 120, 200, 300, 450, 650, 900, 1200, 1600,
  2100, 2700, 3400, 4200, 5100, 6100, 7200, 8500, 10000, 12000,
];

export const LEAGUE_THRESHOLDS: { league: League; minXp: number; label: string; color: string; icon: string }[] = [
  { league: "bronze", minXp: 0, label: "ブロンズ", color: "#CD7F32", icon: "🥉" },
  { league: "silver", minXp: 500, label: "シルバー", color: "#C0C0C0", icon: "🥈" },
  { league: "gold", minXp: 1500, label: "ゴールド", color: "#FFD700", icon: "🥇" },
  { league: "platinum", minXp: 3500, label: "プラチナ", color: "#E5E4E2", icon: "💎" },
  { league: "diamond", minXp: 7000, label: "ダイヤモンド", color: "#B9F2FF", icon: "👑" },
];

export function getLevel(totalXp: number): number {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalXp >= LEVEL_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

export function getLevelProgress(totalXp: number): { current: number; next: number; progress: number } {
  const level = getLevel(totalXp);
  const current = LEVEL_THRESHOLDS[level - 1] || 0;
  const next = LEVEL_THRESHOLDS[level] || current + 500;
  const progress = Math.min(((totalXp - current) / (next - current)) * 100, 100);
  return { current, next, progress };
}

export function getLeague(totalXp: number): League {
  for (let i = LEAGUE_THRESHOLDS.length - 1; i >= 0; i--) {
    if (totalXp >= LEAGUE_THRESHOLDS[i].minXp) return LEAGUE_THRESHOLDS[i].league;
  }
  return "bronze";
}

export function getLeagueInfo(league: League) {
  return LEAGUE_THRESHOLDS.find((l) => l.league === league) || LEAGUE_THRESHOLDS[0];
}

const QUEST_POOL: Omit<DailyQuest, "current" | "completed">[] = [
  { id: "q_checklist_3", label: "チェックリストを3件完了", icon: "✅", target: 3, xpReward: 20 },
  { id: "q_checklist_5", label: "チェックリストを5件完了", icon: "✅", target: 5, xpReward: 30 },
  { id: "q_briefing", label: "AIブリーフィングを生成", icon: "🤖", target: 1, xpReward: 20 },
  { id: "q_meeting", label: "面談を記録する", icon: "📝", target: 1, xpReward: 25 },
  { id: "q_status", label: "ステータスを更新", icon: "📊", target: 1, xpReward: 15 },
  { id: "q_match", label: "求人マッチングを実行", icon: "🔍", target: 1, xpReward: 15 },
  { id: "q_knowledge", label: "業界知識を閲覧", icon: "📚", target: 2, xpReward: 10 },
  { id: "q_recommendation", label: "推薦案件を作成", icon: "🔗", target: 1, xpReward: 20 },
];

export function generateDailyQuests(date: string): DailyQuest[] {
  const seed = date.split("-").reduce((a, b) => a + parseInt(b), 0);
  const shuffled = [...QUEST_POOL].sort((a, b) => {
    const ha = (seed * 31 + a.id.charCodeAt(2)) % 100;
    const hb = (seed * 31 + b.id.charCodeAt(2)) % 100;
    return ha - hb;
  });
  return shuffled.slice(0, 3).map((q) => ({ ...q, current: 0, completed: false }));
}

export const ALL_ACHIEVEMENTS: Achievement[] = [
  { id: "first_check", title: "ファーストステップ", description: "最初のチェックリストを完了", icon: "👣", unlocked: false, tier: "bronze" },
  { id: "phase_master", title: "フェーズマスター", description: "1つのフェーズを完全クリア", icon: "🎯", unlocked: false, tier: "silver" },
  { id: "matchmaker_5", title: "マッチメーカー", description: "推薦案件を5件作成", icon: "💘", unlocked: false, tier: "silver" },
  { id: "meeting_10", title: "面談のプロ", description: "面談を10回記録", icon: "🎤", unlocked: false, tier: "gold" },
  { id: "first_place", title: "初成約！", description: "初めての候補者成約", icon: "🏆", unlocked: false, tier: "gold" },
  { id: "streak_7", title: "1週間連続", description: "7日連続ログイン", icon: "🔥", unlocked: false, tier: "bronze" },
  { id: "streak_30", title: "鉄人", description: "30日連続ログイン", icon: "⚡", unlocked: false, tier: "platinum" },
  { id: "xp_1000", title: "XPハンター", description: "累計1000 XP獲得", icon: "💫", unlocked: false, tier: "silver" },
  { id: "xp_5000", title: "XPマスター", description: "累計5000 XP獲得", icon: "🌟", unlocked: false, tier: "gold" },
  { id: "daily_quest_7", title: "クエストクリア", description: "デイリークエストを7回達成", icon: "📜", unlocked: false, tier: "bronze" },
  { id: "ai_power", title: "AI活用マスター", description: "AIブリーフィングを10回生成", icon: "🧠", unlocked: false, tier: "silver" },
  { id: "knowledge", title: "業界通", description: "全ての業界カテゴリを閲覧", icon: "🗺️", unlocked: false, tier: "bronze" },
];

export const MOCK_LEADERBOARD: { name: string; xp: number; streak: number; avatar: string }[] = [
  { name: "田中 翔太", xp: 4820, streak: 15, avatar: "🧑‍💼" },
  { name: "鈴木 美咲", xp: 3540, streak: 22, avatar: "👩‍💼" },
  { name: "佐藤 健一", xp: 2890, streak: 8, avatar: "👨‍💼" },
  { name: "高橋 あい", xp: 2210, streak: 12, avatar: "👩‍💻" },
  { name: "山本 大輔", xp: 1680, streak: 5, avatar: "🧑‍💻" },
];
