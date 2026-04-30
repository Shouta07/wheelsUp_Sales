import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { GamificationState, DailyQuest } from "./types";
import {
  ALL_ACHIEVEMENTS,
  generateDailyQuests,
  getLeague,
  getLevel,
  XP_ACTIONS,
} from "./config";

const STORAGE_KEY = "wheelsup_gamification";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function defaultState(): GamificationState {
  const d = today();
  return {
    totalXp: 0,
    weeklyXp: 0,
    todayXp: 0,
    level: 1,
    league: "bronze",
    streak: 1,
    longestStreak: 1,
    lastActiveDate: d,
    xpHistory: [],
    dailyQuests: generateDailyQuests(d),
    achievements: ALL_ACHIEVEMENTS.map((a) => ({ ...a })),
    questsLastRefreshed: d,
    celebrationQueue: [],
  };
}

function loadState(): GamificationState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const saved = JSON.parse(raw) as GamificationState;
    const d = today();
    if (saved.questsLastRefreshed !== d) {
      saved.dailyQuests = generateDailyQuests(d);
      saved.questsLastRefreshed = d;
      saved.todayXp = 0;
    }
    if (saved.lastActiveDate !== d) {
      const lastDate = new Date(saved.lastActiveDate);
      const todayDate = new Date(d);
      const diff = Math.floor((todayDate.getTime() - lastDate.getTime()) / 86400000);
      if (diff === 1) {
        saved.streak += 1;
        if (saved.streak > saved.longestStreak) saved.longestStreak = saved.streak;
      } else if (diff > 1) {
        saved.streak = 1;
      }
      saved.lastActiveDate = d;
      saved.todayXp = 0;
    }
    return saved;
  } catch {
    return defaultState();
  }
}

interface GamificationContextValue {
  state: GamificationState;
  earnXp: (action: string, multiplier?: number) => void;
  progressQuest: (questId: string, amount?: number) => void;
  unlockAchievement: (achievementId: string) => void;
  popCelebration: () => string | undefined;
}

const GamificationContext = createContext<GamificationContextValue | null>(null);

export function GamificationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GamificationState>(loadState);
  const saveRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, 300);
    return () => { if (saveRef.current) clearTimeout(saveRef.current); };
  }, [state]);

  const earnXp = useCallback((action: string, multiplier = 1) => {
    const config = XP_ACTIONS[action];
    if (!config) return;
    const xp = config.xp * multiplier;

    setState((prev) => {
      const totalXp = prev.totalXp + xp;
      const newLevel = getLevel(totalXp);
      const celebrations = [...prev.celebrationQueue];

      if (newLevel > prev.level) {
        celebrations.push(`level_up_${newLevel}`);
      }

      return {
        ...prev,
        totalXp,
        weeklyXp: prev.weeklyXp + xp,
        todayXp: prev.todayXp + xp,
        level: newLevel,
        league: getLeague(totalXp),
        xpHistory: [...prev.xpHistory.slice(-99), { action, xp, timestamp: Date.now() }],
        celebrationQueue: celebrations,
      };
    });
  }, []);

  const progressQuest = useCallback((questId: string, amount = 1) => {
    setState((prev) => {
      const quests = prev.dailyQuests.map((q): DailyQuest => {
        if (q.id !== questId || q.completed) return q;
        const current = Math.min(q.current + amount, q.target);
        const completed = current >= q.target;
        return { ...q, current, completed };
      });

      const justCompleted = quests.find(
        (q) => q.id === questId && q.completed && !prev.dailyQuests.find((p) => p.id === questId)?.completed,
      );

      let totalXp = prev.totalXp;
      let todayXp = prev.todayXp;
      let weeklyXp = prev.weeklyXp;
      const celebrations = [...prev.celebrationQueue];

      if (justCompleted) {
        totalXp += justCompleted.xpReward;
        todayXp += justCompleted.xpReward;
        weeklyXp += justCompleted.xpReward;
        celebrations.push(`quest_${questId}`);
      }

      return {
        ...prev,
        dailyQuests: quests,
        totalXp,
        todayXp,
        weeklyXp,
        level: getLevel(totalXp),
        league: getLeague(totalXp),
        celebrationQueue: celebrations,
      };
    });
  }, []);

  const unlockAchievement = useCallback((achievementId: string) => {
    setState((prev) => {
      const already = prev.achievements.find((a) => a.id === achievementId && a.unlocked);
      if (already) return prev;

      const achievements = prev.achievements.map((a) =>
        a.id === achievementId ? { ...a, unlocked: true, unlockedAt: Date.now() } : a,
      );
      return {
        ...prev,
        achievements,
        celebrationQueue: [...prev.celebrationQueue, `achievement_${achievementId}`],
      };
    });
  }, []);

  const popCelebration = useCallback((): string | undefined => {
    let popped: string | undefined;
    setState((prev) => {
      if (prev.celebrationQueue.length === 0) return prev;
      popped = prev.celebrationQueue[0];
      return { ...prev, celebrationQueue: prev.celebrationQueue.slice(1) };
    });
    return popped;
  }, []);

  return (
    <GamificationContext.Provider value={{ state, earnXp, progressQuest, unlockAchievement, popCelebration }}>
      {children}
    </GamificationContext.Provider>
  );
}

export function useGamification() {
  const ctx = useContext(GamificationContext);
  if (!ctx) throw new Error("useGamification must be used within GamificationProvider");
  return ctx;
}
