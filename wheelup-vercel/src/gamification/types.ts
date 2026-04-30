export interface XpEvent {
  action: string;
  xp: number;
  timestamp: number;
}

export interface DailyQuest {
  id: string;
  label: string;
  icon: string;
  target: number;
  current: number;
  xpReward: number;
  completed: boolean;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked: boolean;
  unlockedAt?: number;
  tier: "bronze" | "silver" | "gold" | "platinum";
}

export interface LeaderboardEntry {
  name: string;
  xp: number;
  level: number;
  streak: number;
  avatar: string;
  isCurrentUser?: boolean;
}

export type League = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export interface GamificationState {
  totalXp: number;
  weeklyXp: number;
  todayXp: number;
  level: number;
  league: League;
  streak: number;
  longestStreak: number;
  lastActiveDate: string;
  xpHistory: XpEvent[];
  dailyQuests: DailyQuest[];
  achievements: Achievement[];
  questsLastRefreshed: string;
  celebrationQueue: string[];
}
