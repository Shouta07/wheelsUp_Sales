// @ts-nocheck
import { useState, useCallback } from "react";
import { useSearch } from "../hooks/useSearch";
import SearchResultCard from "../components/SearchResult";

const QUICK_CHIPS = [
  "競合比較",
  "導入事例",
  "FAQ",
  "価格",
  "割引条件",
  "技術要件",
] as const;

export default function SearchPanel() {
  const [query, setQuery] = useState("");
  const [chatType, setChatType] = useState<string>("");
  const [dateRange, setDateRange] = useState<string>("all");
  const { data, isLoading, error, search, debouncedSearch } = useSearch();

  const handleInput = useCallback(
    (value: string) => {
      setQuery(value);
      if (value.trim().length >= 2) {
        debouncedSearch({
          query: value,
          chat_type: chatType || undefined,
          date_range: dateRange !== "all" ? dateRange : undefined,
        });
      }
    },
    [chatType, dateRange, debouncedSearch],
  );

  const handleChipClick = (chip: string) => {
    setQuery(chip);
    search({
      query: chip,
      chat_type: chatType || undefined,
      date_range: dateRange !== "all" ? dateRange : undefined,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      search({
        query,
        chat_type: chatType || undefined,
        date_range: dateRange !== "all" ? dateRange : undefined,
      });
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900">商談中 — ナレッジ検索</h1>
      <p className="mt-1 text-sm text-gray-500">
        Lark の過去ログからリアルタイムに情報を検索できます
      </p>

      {/* Search Form */}
      <form onSubmit={handleSubmit} className="mt-6">
        <div className="relative">
          <input
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="検索キーワードを入力..."
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 pl-10 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
          <svg
            className="absolute left-3 top-3.5 h-4 w-4 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          {isLoading && (
            <div className="absolute right-3 top-3.5">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
            </div>
          )}
        </div>
      </form>

      {/* Quick Chips */}
      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => handleChipClick(chip)}
            className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mt-4 flex gap-3">
        <select
          value={chatType}
          onChange={(e) => setChatType(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
        >
          <option value="">すべてのチャンネル</option>
          <option value="product">製品</option>
          <option value="customer">顧客</option>
          <option value="internal">社内</option>
          <option value="announce">アナウンス</option>
        </select>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700"
        >
          <option value="all">全期間</option>
          <option value="7d">直近7日</option>
          <option value="30d">直近30日</option>
          <option value="90d">直近90日</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Results */}
      {data && (
        <div className="mt-6">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>
              {data.total} 件の結果
            </span>
            <span>{data.query_time_ms}ms</span>
          </div>
          <div className="mt-3 space-y-3">
            {data.results.map((result, i) => (
              <SearchResultCard
                key={`${result.source.created_at}-${i}`}
                result={result}
                onAddNote={(text) => {
                  navigator.clipboard.writeText(text);
                  alert("クリップボードにコピーしました");
                }}
              />
            ))}
          </div>
          {data.total === 0 && (
            <p className="mt-8 text-center text-gray-400">
              一致する結果がありません
            </p>
          )}
        </div>
      )}
    </div>
  );
}
