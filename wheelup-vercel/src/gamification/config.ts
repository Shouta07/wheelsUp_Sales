import type { Achievement, League } from "./types";

// XP is earned ONLY from meeting-related actions
export const XP_ACTIONS: Record<string, { xp: number; label: string }> = {
  meeting_uploaded: { xp: 30, label: "面談を記録" },
  meeting_scored: { xp: 50, label: "面談を採点" },
  score_improved: { xp: 40, label: "スコアアップ" },
  beat_leader_axis: { xp: 60, label: "リーダー超え（1軸）" },
  grade_up: { xp: 100, label: "グレード昇格" },
  playbook_viewed: { xp: 10, label: "プレイブック参照" },
  streak_bonus: { xp: 20, label: "連続記録ボーナス" },
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

// All achievements tied to meeting performance
export const ALL_ACHIEVEMENTS: Achievement[] = [
  { id: "first_score", title: "はじめの採点", description: "最初の面談をスコアリング", icon: "🎯", unlocked: false, tier: "bronze" },
  { id: "score_30", title: "Bランク到達", description: "面談スコア30点以上を記録", icon: "✅", unlocked: false, tier: "bronze" },
  { id: "score_35", title: "Aランク到達", description: "面談スコア35点以上を記録", icon: "🌟", unlocked: false, tier: "silver" },
  { id: "score_40", title: "Sランク到達", description: "面談スコア40点以上を記録", icon: "👑", unlocked: false, tier: "gold" },
  { id: "beat_leader_1", title: "リーダー超え", description: "1軸でリーダー平均を上回る", icon: "💪", unlocked: false, tier: "silver" },
  { id: "beat_leader_3", title: "リーダーに肉薄", description: "3軸でリーダー平均を上回る", icon: "🔥", unlocked: false, tier: "gold" },
  { id: "beat_leader_5", title: "リーダー超越", description: "全5軸でリーダー平均を上回る", icon: "🏆", unlocked: false, tier: "platinum" },
  { id: "meetings_5", title: "5面談達成", description: "5件の面談をスコアリング", icon: "📝", unlocked: false, tier: "bronze" },
  { id: "meetings_20", title: "面談マスター", description: "20件の面談をスコアリング", icon: "📊", unlocked: false, tier: "silver" },
  { id: "streak_7", title: "1週間連続", description: "7日連続で面談を記録", icon: "🔥", unlocked: false, tier: "silver" },
  { id: "improvement_5", title: "成長の証", description: "スコアが5点以上向上", icon: "📈", unlocked: false, tier: "bronze" },
  { id: "improvement_15", title: "急成長", description: "スコアが15点以上向上", icon: "🚀", unlocked: false, tier: "gold" },
];

import type { DailyQuest } from "./types";

const QUEST_POOL: Omit<DailyQuest, "current" | "completed">[] = [
  { id: "q_upload", label: "面談を1件記録する", icon: "📝", target: 1, xpReward: 30 },
  { id: "q_upload_2", label: "面談を2件記録する", icon: "📝", target: 2, xpReward: 50 },
  { id: "q_playbook", label: "プレイブックを確認する", icon: "📖", target: 1, xpReward: 10 },
  { id: "q_review", label: "過去の採点結果を振り返る", icon: "📊", target: 1, xpReward: 15 },
];

export function generateDailyQuests(date: string): DailyQuest[] {
  const seed = date.split("-").reduce((a, b) => a + parseInt(b), 0);
  const shuffled = [...QUEST_POOL].sort((a, b) => {
    const ha = (seed * 31 + a.id.charCodeAt(2)) % 100;
    const hb = (seed * 31 + b.id.charCodeAt(2)) % 100;
    return ha - hb;
  });
  return shuffled.slice(0, 2).map((q) => ({ ...q, current: 0, completed: false }));
}
