import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { GamificationState, DailyQuest } from "./types";
import type { ConsultantMetrics, GamificationResponse } from "../api/client";
import { fetchGamificationMetrics } from "../api/client";
import { ALL_ACHIEVEMENTS, generateDailyQuests, getLeague, getLevel } from "./config";
import { isSupabaseConfigured } from "../lib/supabase";

const STORAGE_PREFIX = "wheelsup_gamification_";
const CURRENT_USER_KEY = "wheelsup_current_user";

function storageKey(userName: string): string {
  return `${STORAGE_PREFIX}${userName}`;
}

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

function loadLocal(userName: string): GamificationState {
  try {
    const raw = localStorage.getItem(storageKey(userName));
    if (!raw) return defaultState();
    const saved = JSON.parse(raw) as GamificationState;
    const d = today();
    if (saved.questsLastRefreshed !== d) {
      saved.dailyQuests = generateDailyQuests(d);
      saved.questsLastRefreshed = d;
      saved.todayXp = 0;
    }
    if (saved.lastActiveDate !== d) {
      const diff = Math.floor(
        (new Date(d).getTime() - new Date(saved.lastActiveDate).getTime()) / 86400000,
      );
      saved.streak = diff === 1 ? saved.streak + 1 : diff > 1 ? 1 : saved.streak;
      if (saved.streak > saved.longestStreak) saved.longestStreak = saved.streak;
      saved.lastActiveDate = d;
      saved.todayXp = 0;
    }
    return saved;
  } catch {
    return defaultState();
  }
}

export function getSavedUser(): string | null {
  return localStorage.getItem(CURRENT_USER_KEY) || null;
}

export function clearSavedUser() {
  localStorage.removeItem(CURRENT_USER_KEY);
}

interface GamificationContextValue {
  state: GamificationState;
  currentUser: string;
  pipedriveData: GamificationResponse | null;
  myMetrics: ConsultantMetrics | null;
  loading: boolean;
  earnXp: (action: string, multiplier?: number) => void;
  progressQuest: (questId: string, amount?: number) => void;
  unlockAchievement: (achievementId: string) => void;
  popCelebration: () => string | undefined;
  refreshPipedriveData: () => Promise<void>;
  setCurrentUser: (name: string) => void;
}

const GamificationContext = createContext<GamificationContextValue | null>(null);

export function GamificationProvider({ children, userName }: { children: ReactNode; userName: string }) {
  const [state, setState] = useState<GamificationState>(() => loadLocal(userName));
  const [pipedriveData, setPipedriveData] = useState<GamificationResponse | null>(null);
  const [myMetrics, setMyMetrics] = useState<ConsultantMetrics | null>(null);
  const [currentUser, setCurrentUserState] = useState<string>(userName);
  const [loading, setLoading] = useState(false);

  const setCurrentUser = useCallback((name: string) => {
    setCurrentUserState(name);
    localStorage.setItem(CURRENT_USER_KEY, name);
    setState(loadLocal(name));
  }, []);

  // Persist to localStorage per user
  useEffect(() => {
    if (!currentUser) return;
    const t = setTimeout(() => localStorage.setItem(storageKey(currentUser), JSON.stringify(state)), 300);
    return () => clearTimeout(t);
  }, [state, currentUser]);

  // Merge Pipedrive XP with local state
  useEffect(() => {
    if (!myMetrics) return;
    setState((prev) => {
      const pipedriveXp = myMetrics.xp;
      if (pipedriveXp <= prev.totalXp) return prev;
      return {
        ...prev,
        totalXp: pipedriveXp,
        weeklyXp: myMetrics.activities_this_week * 15,
        level: getLevel(pipedriveXp),
        league: getLeague(pipedriveXp),
        streak: myMetrics.streak_days > 0 ? myMetrics.streak_days : prev.streak,
      };
    });
  }, [myMetrics]);

  const refreshPipedriveData = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setLoading(true);
    try {
      const data = await fetchGamificationMetrics();
      setPipedriveData(data);
      if (currentUser) {
        const me = data.consultants.find((c) => c.name === currentUser);
        setMyMetrics(me || null);
      } else if (data.consultants.length > 0) {
        setMyMetrics(data.consultants[0]);
        setCurrentUser(data.consultants[0].name);
      }
    } catch {
      // API not available (preview mode)
    }
    setLoading(false);
  }, [currentUser]);

  // Fetch on mount
  useEffect(() => {
    refreshPipedriveData();
  }, []);

  const earnXp = useCallback((action: string, multiplier = 1) => {
    const xpMap: Record<string, number> = {
      checklist_item: 10, phase_complete: 50, ai_briefing: 15,
      meeting_logged: 30, meeting_notes: 20, status_update: 25,
      job_match: 15, recommendation_created: 20, candidate_placed: 200,
      knowledge_view: 5,
    };
    const xp = (xpMap[action] || 10) * multiplier;

    setState((prev) => {
      const totalXp = prev.totalXp + xp;
      const newLevel = getLevel(totalXp);
      const celebrations = [...prev.celebrationQueue];
      if (newLevel > prev.level) celebrations.push(`level_up_${newLevel}`);
      return {
        ...prev,
        totalXp, weeklyXp: prev.weeklyXp + xp, todayXp: prev.todayXp + xp,
        level: newLevel, league: getLeague(totalXp),
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
        return { ...q, current, completed: current >= q.target };
      });
      const justDone = quests.find(
        (q) => q.id === questId && q.completed && !prev.dailyQuests.find((p) => p.id === questId)?.completed,
      );
      if (!justDone) return { ...prev, dailyQuests: quests };
      const totalXp = prev.totalXp + justDone.xpReward;
      return {
        ...prev, dailyQuests: quests, totalXp,
        todayXp: prev.todayXp + justDone.xpReward,
        weeklyXp: prev.weeklyXp + justDone.xpReward,
        level: getLevel(totalXp), league: getLeague(totalXp),
        celebrationQueue: [...prev.celebrationQueue, `quest_${questId}`],
      };
    });
  }, []);

  const unlockAchievement = useCallback((id: string) => {
    setState((prev) => {
      if (prev.achievements.find((a) => a.id === id && a.unlocked)) return prev;
      return {
        ...prev,
        achievements: prev.achievements.map((a) =>
          a.id === id ? { ...a, unlocked: true, unlockedAt: Date.now() } : a,
        ),
        celebrationQueue: [...prev.celebrationQueue, `achievement_${id}`],
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
    <GamificationContext.Provider
      value={{
        state, currentUser, pipedriveData, myMetrics, loading,
        earnXp, progressQuest, unlockAchievement, popCelebration,
        refreshPipedriveData, setCurrentUser,
      }}
    >
      {children}
    </GamificationContext.Provider>
  );
}

export function useGamification() {
  const ctx = useContext(GamificationContext);
  if (!ctx) throw new Error("useGamification must be used within GamificationProvider");
  return ctx;
}
