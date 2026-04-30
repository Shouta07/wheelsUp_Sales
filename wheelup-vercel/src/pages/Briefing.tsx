import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { useBriefing } from "../hooks/usePipedrive";

export default function Briefing() {
  const [searchParams] = useSearchParams();
  const initialDealId = searchParams.get("deal_id");
  const [dealIdInput, setDealIdInput] = useState(initialDealId ?? "");
  const dealId = dealIdInput ? parseInt(dealIdInput, 10) : null;

  const briefing = useBriefing(dealId);

  const handleGenerate = () => {
    if (dealId) {
      briefing.mutate();
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900">商談前 — ブリーフィング</h1>
      <p className="mt-1 text-sm text-gray-500">
        Pipedrive の案件情報と Lark の過去ログからブリーフィングを自動生成します
      </p>

      {/* Deal ID Input */}
      <div className="mt-6 flex gap-3">
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-700">
            Pipedrive Deal ID
          </label>
          <input
            type="number"
            value={dealIdInput}
            onChange={(e) => setDealIdInput(e.target.value)}
            placeholder="例: 123"
            className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={handleGenerate}
            disabled={!dealId || briefing.isPending}
            className="rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {briefing.isPending ? (
              <span className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                生成中...
              </span>
            ) : (
              "ブリーフィング生成"
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {briefing.isError && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {briefing.error instanceof Error
            ? briefing.error.message
            : "ブリーフィング生成に失敗しました"}
        </div>
      )}

      {/* Result */}
      {briefing.data && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              ブリーフィング — Deal #{briefing.data.deal_id}
            </h2>
            <button
              onClick={() =>
                navigator.clipboard.writeText(briefing.data!.briefing)
              }
              className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
            >
              コピー
            </button>
          </div>
          <div className="mt-3 rounded-lg border border-gray-200 bg-white p-6 prose prose-sm max-w-none">
            <ReactMarkdown>{briefing.data.briefing}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Tips */}
      {!briefing.data && !briefing.isPending && (
        <div className="mt-8 rounded-lg bg-blue-50 p-4">
          <h3 className="font-medium text-blue-800">使い方</h3>
          <ul className="mt-2 space-y-1 text-sm text-blue-700">
            <li>1. Pipedrive の Deal ID を入力</li>
            <li>2. 「ブリーフィング生成」をクリック</li>
            <li>
              3. AI が Pipedrive + Lark の情報を統合してブリーフィングを生成
            </li>
            <li>
              4. 企業概要・担当者情報・過去の経緯・推奨アプローチが確認可能
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
