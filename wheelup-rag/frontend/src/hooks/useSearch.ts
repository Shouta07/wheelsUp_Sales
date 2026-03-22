import { useState, useCallback, useRef } from "react";
import { searchKnowledge, type SearchParams, type SearchResponse } from "../api/client";

export function useSearch() {
  const [data, setData] = useState<SearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const search = useCallback(async (params: SearchParams) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await searchKnowledge(params);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "検索エラー");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const debouncedSearch = useCallback(
    (params: SearchParams, delay = 300) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => search(params), delay);
    },
    [search],
  );

  return { data, isLoading, error, search, debouncedSearch };
}
