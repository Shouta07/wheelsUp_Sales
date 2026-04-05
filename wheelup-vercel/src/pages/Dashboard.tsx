import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  fetchPipelineStats,
  fetchStaleDeals,
  syncPipedriveDeals,
  syncPipedriveActivities,
  syncPipedrivePersons,
  type PipelineStage,
  type DealItem,
} from "../api/client";

function StageBadge({ status, daysInStage }: { status: string; daysInStage?: number }) {
  const colors: Record<string, string> = {
    open: "bg-blue-100 text-blue-700",
    won: "bg-green-100 text-green-700",
    lost: "bg-red-100 text-red-700",
  };
  const isStale = daysInStage && daysInStage > 7;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isStale ? "bg-red-100 text-red-700" : colors[status] || "bg-gray-100 text-gray-700"}`}>
      {isStale ? `${daysInStage}日停滞` : status}
    </span>
  );
}

function PipelineBoard({ stages }: { stages: PipelineStage[] }) {
  const navigate = useNavigate();

  if (stages.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p>パイプラインデータがありません</p>
        <p className="text-xs mt-1">「Pipedrive同期」ボタンでデータを取得してください</p>
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {stages.map((stage) => (
        <div key={stage.name} className="flex-shrink-0 w-72">
          <div className="rounded-t-lg bg-gray-100 px-3 py-2 border border-gray-200 border-b-0">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">{stage.name}</h3>
              <span className="text-xs text-gray-500">{stage.count}件</span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
              <span>{(stage.value / 10000).toFixed(0)}万円</span>
              <span>平均{stage.avg_days}日</span>
            </div>
          </div>
          <div className="border border-gray-200 rounded-b-lg bg-gray-50 p-2 space-y-2 min-h-[100px]">
            {stage.deals.map((deal) => (
              <div
                key={deal.id}
                onClick={() => navigate(`/candidate-prep?deal_id=${deal.id}`)}
                className="bg-white rounded-lg border border-gray-200 p-3 cursor-pointer hover:shadow-md transition-shadow"
              >
                <p className="text-sm font-medium text-gray-900 truncate">{deal.title}</p>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-gray-500">{deal.person_name}</span>
                  <StageBadge status="open" daysInStage={deal.days_in_stage} />
                </div>
                {deal.value > 0 && (
                  <p className="text-xs text-gray-400 mt-1">{(deal.value / 10000).toFixed(0)}万円</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [staleDays, setStaleDays] = useState(7);

  const { data: pipeline, isLoading } = useQuery({
    queryKey: ["pipeline-stats"],
    queryFn: fetchPipelineStats,
  });

  const { data: staleData } = useQuery({
    queryKey: ["stale-deals", staleDays],
    queryFn: () => fetchStaleDeals(staleDays),
  });

  const syncAll = async () => {
    setSyncing(true);
    try {
      await syncPipedriveDeals();
      await syncPipedriveActivities();
      await syncPipedrivePersons();
      qc.invalidateQueries({ queryKey: ["pipeline-stats"] });
      qc.invalidateQueries({ queryKey: ["stale-deals"] });
    } catch (e) {
      console.error("Sync error:", e);
    }
    setSyncing(false);
  };

  const stages = pipeline?.stages || [];
  const staleDeals = staleData?.stale_deals || [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">パイプライン</h1>
          <p className="mt-1 text-sm text-gray-500">
            Pipedrive の案件状況をリアルタイムに把握
          </p>
        </div>
        <button
          onClick={syncAll}
          disabled={syncing}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
        >
          {syncing ? "同期中..." : "Pipedrive同期"}
        </button>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-4 gap-4">
        <div className="rounded-lg bg-white p-4 border border-gray-200">
          <p className="text-sm text-gray-500">アクティブ案件</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{pipeline?.total_deals || 0}</p>
        </div>
        <div className="rounded-lg bg-white p-4 border border-gray-200">
          <p className="text-sm text-gray-500">総パイプライン金額</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {((pipeline?.total_value || 0) / 10000).toFixed(0)}万円
          </p>
        </div>
        <div className="rounded-lg bg-white p-4 border border-gray-200">
          <p className="text-sm text-gray-500">ステージ数</p>
          <p className="mt-1 text-2xl font-bold text-primary-600">{stages.length}</p>
        </div>
        <div className="rounded-lg bg-white p-4 border border-red-200 bg-red-50">
          <p className="text-sm text-red-600">停滞案件（{staleDays}日以上）</p>
          <p className="mt-1 text-2xl font-bold text-red-700">{staleDeals.length}</p>
        </div>
      </div>

      {/* Pipeline Board */}
      <div className="mt-6">
        <h2 className="text-lg font-bold text-gray-900 mb-3">パイプラインボード</h2>
        {isLoading ? (
          <div className="text-center py-12 text-gray-400">読み込み中...</div>
        ) : (
          <PipelineBoard stages={stages} />
        )}
      </div>

      {/* Stale Deals Alert */}
      {staleDeals.length > 0 && (
        <div className="mt-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-red-700">停滞案件アラート</h2>
            <select
              className="text-sm border rounded-lg px-2 py-1"
              value={staleDays}
              onChange={(e) => setStaleDays(parseInt(e.target.value))}
            >
              <option value={3}>3日以上</option>
              <option value={7}>7日以上</option>
              <option value={14}>14日以上</option>
              <option value={30}>30日以上</option>
            </select>
          </div>
          <div className="space-y-2">
            {staleDeals.map((deal: DealItem) => (
              <div key={deal.id} className="rounded-lg border border-red-200 bg-red-50 p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{deal.title}</p>
                  <p className="text-xs text-gray-500">
                    {deal.person_name} / {deal.org_name} — ステージ: {deal.stage_name}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-red-700">{deal.days_in_stage}日</p>
                  <p className="text-xs text-gray-400">
                    最終活動: {deal.last_activity_date || "なし"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
