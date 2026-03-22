import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { useSummary, useSaveSummary } from "../hooks/usePipedrive";

export default function PostMeeting() {
  const [searchParams] = useSearchParams();
  const initialDealId = searchParams.get("deal_id");
  const [dealIdInput, setDealIdInput] = useState(initialDealId ?? "");
  const [notes, setNotes] = useState("");
  const [duration, setDuration] = useState("60");
  const [attendeesInput, setAttendeesInput] = useState("");

  const dealId = dealIdInput ? parseInt(dealIdInput, 10) : null;
  const summary = useSummary(dealId);
  const saveSummary = useSaveSummary(dealId);

  const buildRequest = () => ({
    meeting_notes: notes,
    duration_minutes: parseInt(duration, 10) || 60,
    attendees: attendeesInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  });

  const handleGenerate = () => {
    if (dealId && notes.trim()) {
      summary.mutate(buildRequest());
    }
  };

  const handleSaveToPipedrive = () => {
    if (dealId && notes.trim()) {
      saveSummary.mutate(buildRequest());
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900">商談後 — サマリー</h1>
      <p className="mt-1 text-sm text-gray-500">
        商談メモから構造化サマリーを生成し、Pipedrive に自動登録します
      </p>

      {/* Form */}
      <div className="mt-6 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Deal ID
            </label>
            <input
              type="number"
              value={dealIdInput}
              onChange={(e) => setDealIdInput(e.target.value)}
              placeholder="123"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              商談時間（分）
            </label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              参加者（カンマ区切り）
            </label>
            <input
              type="text"
              value={attendeesInput}
              onChange={(e) => setAttendeesInput(e.target.value)}
              placeholder="山田部長, 田中（自社）"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            商談メモ
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={8}
            placeholder={`商談中のメモを入力してください...\n\n例:\n・NTTファシリティーズの施工管理案件について打合せ\n・山田部長は採用を急いでいる（来月末までに1名）\n・年収レンジは450-550万で承認済み\n・1級電気工事施工管理技士の資格必須\n・次回：候補者3名の推薦書を来週水曜までに送る`}
            className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleGenerate}
            disabled={!dealId || !notes.trim() || summary.isPending}
            className="rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {summary.isPending ? (
              <span className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                生成中...
              </span>
            ) : (
              "サマリー生成"
            )}
          </button>
          <button
            onClick={handleSaveToPipedrive}
            disabled={
              !dealId || !notes.trim() || saveSummary.isPending
            }
            className="rounded-lg bg-green-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saveSummary.isPending ? (
              <span className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                送信中...
              </span>
            ) : (
              "Pipedrive に送信"
            )}
          </button>
        </div>
      </div>

      {/* Error */}
      {(summary.isError || saveSummary.isError) && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {(summary.error ?? saveSummary.error) instanceof Error
            ? (summary.error ?? saveSummary.error)!.message
            : "サマリー生成に失敗しました"}
        </div>
      )}

      {/* Pipedrive save success */}
      {saveSummary.data && (
        <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-700">
          Pipedrive に保存しました（Note ID: {saveSummary.data.pipedrive_note_id}）
        </div>
      )}

      {/* Result */}
      {(summary.data || saveSummary.data) && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              商談サマリー
            </h2>
            <button
              onClick={() =>
                navigator.clipboard.writeText(
                  (summary.data ?? saveSummary.data)!.summary,
                )
              }
              className="rounded-md bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
            >
              コピー
            </button>
          </div>
          <div className="mt-3 rounded-lg border border-gray-200 bg-white p-6 prose prose-sm max-w-none">
            <ReactMarkdown>
              {(summary.data ?? saveSummary.data)!.summary}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
