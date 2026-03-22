import { useNavigate } from "react-router-dom";
import type { Deal } from "../api/client";

interface Props {
  deal: Deal;
}

const stageBadge: Record<string, string> = {
  qualified: "bg-blue-100 text-blue-700",
  proposal: "bg-yellow-100 text-yellow-700",
  negotiation: "bg-orange-100 text-orange-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700",
};

export default function DealCard({ deal }: Props) {
  const navigate = useNavigate();

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{deal.title}</h3>
          <p className="mt-1 text-sm text-gray-500">
            {deal.org_name && <span>{deal.org_name}</span>}
            {deal.person_name && <span> / {deal.person_name}</span>}
          </p>
        </div>
        <span
          className={`ml-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
            stageBadge[deal.status] ?? "bg-gray-100 text-gray-700"
          }`}
        >
          {deal.status}
        </span>
      </div>

      {deal.value > 0 && (
        <p className="mt-2 text-lg font-bold text-gray-900">
          {deal.value.toLocaleString()} {deal.currency}
        </p>
      )}

      {deal.next_activity_subject && (
        <p className="mt-2 text-xs text-gray-400">
          次回: {deal.next_activity_subject}
          {deal.next_activity_date && ` (${deal.next_activity_date})`}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => navigate(`/briefing?deal_id=${deal.id}`)}
          className="flex-1 rounded-md bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100 transition-colors"
        >
          ブリーフィング生成
        </button>
        <button
          onClick={() => navigate(`/post-meeting?deal_id=${deal.id}`)}
          className="flex-1 rounded-md bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
        >
          商談後サマリー
        </button>
      </div>
    </div>
  );
}
