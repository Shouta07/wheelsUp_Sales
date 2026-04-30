import { useState, useEffect, useCallback, useRef } from "react";
import { updateRecommendationChecklist } from "../api/client";
import { isSupabaseConfigured } from "../lib/supabase";

const LS_KEY = (recId: string, phase: number, side: string) =>
  `rec_${recId}_p${phase}_${side}`;

/**
 * Manages checklist state for one side (candidate or company) of a recommendation's phase.
 * Loads checked items from the recommendation object and persists changes via API.
 */
export function useRecommendationChecklist(
  recommendationId: string | null,
  phase: number,
  side: "candidate" | "company",
  initialChecked: string[],
) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Load from initial data
  useEffect(() => {
    if (!recommendationId) { setChecked({}); return; }
    const map: Record<string, boolean> = {};
    for (const id of initialChecked) map[id] = true;
    setChecked(map);
  }, [recommendationId, initialChecked.join(",")]);

  const persist = useCallback(
    (next: Record<string, boolean>) => {
      if (!recommendationId) return;
      const items = Object.keys(next).filter((k) => next[k]);

      if (!isSupabaseConfigured) {
        localStorage.setItem(LS_KEY(recommendationId, phase, side), JSON.stringify(next));
        return;
      }

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateRecommendationChecklist(recommendationId, phase, side, items).catch(console.error);
      }, 500);
    },
    [recommendationId, phase, side],
  );

  const toggle = useCallback(
    (id: string) => {
      setChecked((prev) => {
        const next = { ...prev, [id]: !prev[id] };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const checkedCount = Object.values(checked).filter(Boolean).length;

  return { checked, toggle, checkedCount };
}
