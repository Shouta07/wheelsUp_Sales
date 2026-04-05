import { useState } from "react";
import DealCard from "../components/DealCard";
import type { Deal } from "../api/client";

// Demo data — 本番では Pipedrive API から取得
const DEMO_DEALS: Deal[] = [
  {
    id: 1,
    title: "NTTファシリティーズ 施工管理候補者紹介",
    value: 4800000,
    currency: "JPY",
    stage_id: 2,
    person_name: "山田部長",
    org_name: "NTTファシリティーズ",
    status: "proposal",
    expected_close_date: "2026-04-15",
    next_activity_date: "2026-03-25",
    next_activity_subject: "候補者面談フォロー",
  },
  {
    id: 2,
    title: "三井不動産 設備管理者採用支援",
    value: 3200000,
    currency: "JPY",
    stage_id: 1,
    person_name: "佐藤課長",
    org_name: "三井不動産",
    status: "qualified",
    expected_close_date: "2026-05-01",
    next_activity_date: "2026-03-26",
    next_activity_subject: "初回ヒアリング",
  },
  {
    id: 3,
    title: "大成建設 電気施工管理技士 3名採用",
    value: 9600000,
    currency: "JPY",
    stage_id: 3,
    person_name: "田中マネージャー",
    org_name: "大成建設",
    status: "negotiation",
    expected_close_date: "2026-04-30",
    next_activity_date: "2026-03-24",
    next_activity_subject: "条件面調整",
  },
];

export default function Dashboard() {
  const [filter, setFilter] = useState<"all" | "today" | "week">("all");

  const deals = DEMO_DEALS; // TODO: React Query で Pipedrive API から取得

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">商談一覧</h1>
          <p className="mt-1 text-sm text-gray-500">
            Pipedrive の案件を管理し、各フェーズの支援にアクセスできます
          </p>
        </div>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {(["all", "today", "week"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {f === "all" ? "すべて" : f === "today" ? "今日" : "今週"}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-4 gap-4">
        <div className="rounded-lg bg-white p-4 border border-gray-200">
          <p className="text-sm text-gray-500">アクティブ案件</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{deals.length}</p>
        </div>
        <div className="rounded-lg bg-white p-4 border border-gray-200">
          <p className="text-sm text-gray-500">今日の予定</p>
          <p className="mt-1 text-2xl font-bold text-primary-600">2</p>
        </div>
        <div className="rounded-lg bg-white p-4 border border-gray-200">
          <p className="text-sm text-gray-500">総パイプライン金額</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {deals
              .reduce((s, d) => s + d.value, 0)
              .toLocaleString()}
            円
          </p>
        </div>
        <div className="rounded-lg bg-white p-4 border border-gray-200">
          <p className="text-sm text-gray-500">今月の成約</p>
          <p className="mt-1 text-2xl font-bold text-green-600">1</p>
        </div>
      </div>

      {/* Deal Grid */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {deals.map((deal) => (
          <DealCard key={deal.id} deal={deal} />
        ))}
      </div>
    </div>
  );
}
