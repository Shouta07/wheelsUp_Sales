import type { SearchResult as SearchResultType } from "../api/client";

interface Props {
  result: SearchResultType;
  onAddNote?: (text: string) => void;
}

const chatTypeLabel: Record<string, { text: string; color: string }> = {
  product: { text: "製品", color: "bg-purple-100 text-purple-700" },
  customer: { text: "顧客", color: "bg-blue-100 text-blue-700" },
  internal: { text: "社内", color: "bg-gray-100 text-gray-700" },
  announce: { text: "全体", color: "bg-green-100 text-green-700" },
};

function formatDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SearchResultCard({ result, onAddNote }: Props) {
  const badge = chatTypeLabel[result.source.chat_type] ?? {
    text: result.source.chat_type,
    color: "bg-gray-100 text-gray-700",
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs text-gray-400">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 font-medium ${badge.color}`}
        >
          {badge.text}
        </span>
        {result.source.sender_name && (
          <span className="font-medium text-gray-600">
            {result.source.sender_name}
          </span>
        )}
        {result.source.chat_name && <span>{result.source.chat_name}</span>}
        <span>{formatDate(result.source.created_at)}</span>
        <span className="ml-auto text-gray-300">
          {(result.score * 100).toFixed(0)}%
        </span>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
        {result.text}
      </p>

      {Object.values(result.entities).some((arr) => arr.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {result.entities.persons?.map((p) => (
            <span key={p} className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
              {p}
            </span>
          ))}
          {result.entities.companies?.map((c) => (
            <span key={c} className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-700">
              {c}
            </span>
          ))}
          {result.entities.amounts?.map((a) => (
            <span key={a} className="rounded bg-green-50 px-1.5 py-0.5 text-xs text-green-700">
              {a}
            </span>
          ))}
        </div>
      )}

      {onAddNote && (
        <button
          onClick={() => onAddNote(result.text)}
          className="mt-2 text-xs text-primary-600 hover:text-primary-800"
        >
          Pipedrive メモに追加
        </button>
      )}
    </div>
  );
}
