import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchPhaseProgress,
  savePhaseProgress as apiSave,
} from "../api/client";
import { isSupabaseConfigured } from "../lib/supabase";

const LS_KEY = (type: string, id: string, phase: number) =>
  `phase_${phase}_${type}_${id}`;

export function usePhaseChecklist(
  entityType: "candidate" | "company",
  entityId: string | null,
  phase: number,
) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Load on entity change
  useEffect(() => {
    if (!entityId) { setChecked({}); return; }

    if (!isSupabaseConfigured) {
      const raw = localStorage.getItem(LS_KEY(entityType, entityId, phase));
      setChecked(raw ? JSON.parse(raw) : {});
      return;
    }

    fetchPhaseProgress(entityType, entityId, phase)
      .then(({ progress }) => {
        if (progress.length > 0) {
          const map: Record<string, boolean> = {};
          for (const id of progress[0].checked_items) map[id] = true;
          setChecked(map);
        } else {
          setChecked({});
        }
      })
      .catch(() => setChecked({}));
  }, [entityType, entityId, phase]);

  // Save (debounced)
  const persist = useCallback(
    (next: Record<string, boolean>) => {
      if (!entityId) return;
      const items = Object.keys(next).filter((k) => next[k]);

      if (!isSupabaseConfigured) {
        localStorage.setItem(LS_KEY(entityType, entityId, phase), JSON.stringify(next));
        return;
      }

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        apiSave(entityType, entityId, phase, items).catch(console.error);
      }, 500);
    },
    [entityType, entityId, phase],
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
