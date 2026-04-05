import { useState, useEffect } from "react";
import {
  fetchCandidates,
  updateFollowUp,
  addCandidateAction,
  type CandidateItem,
} from "../api/client";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  new: { label: "新規", color: "bg-blue-100 text-blue-700" },
  in_progress: { label: "進行中", color: "bg-green-100 text-green-700" },
  placed: { label: "成約", color: "bg-purple-100 text-purple-700" },
  on_hold: { label: "保留", color: "bg-yellow-100 text-yellow-700" },
  lost: { label: "離脱", color: "bg-red-100 text-red-700" },
};

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  high: { label: "高", color: "bg-red-100 text-red-700 border-red-300" },
  medium: { label: "中", color: "bg-yellow-100 text-yellow-700 border-yellow-300" },
  low: { label: "低", color: "bg-gray-100 text-gray-600 border-gray-300" },
};

const ACTION_TEMPLATES = [
  "電話フォロー",
  "メール送信",
  "求人票送付",
  "面接日程調整",
  "企業フィードバック共有",
  "条件交渉",
  "意向確認",
  "内定後フォロー",
];

export default function FollowUp() {
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [actionInput, setActionInput] = useState<Record<string, string>>({});
  const [resultInput, setResultInput] = useState<Record<string, string>>({});
  const [followUpEditing, setFollowUpEditing] = useState<string | null>(null);
  const [fuDate, setFuDate] = useState("");
  const [fuPriority, setFuPriority] = useState("medium");
  const [fuNotes, setFuNotes] = useState("");

  useEffect(() => {
    loadCandidates();
  }, [filter]);

  const loadCandidates = async () => {
    setLoading(true);
    try {
      const status = filter === "all" ? undefined : filter === "overdue" ? undefined : filter;
      const followUpDue = filter === "overdue" ? true : undefined;
      const res = await fetchCandidates(status, undefined, followUpDue);
      setCandidates(res.candidates);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (candidateId: string) => {
    const action = actionInput[candidateId];
    if (!action) return;
    try {
      const updated = await addCandidateAction(
        candidateId,
        action,
        resultInput[candidateId] || undefined,
      );
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidateId ? updated : c)),
      );
      setActionInput((prev) => ({ ...prev, [candidateId]: "" }));
      setResultInput((prev) => ({ ...prev, [candidateId]: "" }));
    } catch (e) {
      console.error(e);
    }
  };

  const handleFollowUpSave = async (candidateId: string) => {
    try {
      const updated = await updateFollowUp(candidateId, {
        follow_up_date: fuDate || undefined,
        follow_up_priority: fuPriority,
        follow_up_notes: fuNotes || undefined,
      });
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidateId ? updated : c)),
      );
      setFollowUpEditing(null);
    } catch (e) {
      console.error(e);
    }
  };

  const handleStatusChange = async (candidateId: string, status: string) => {
    try {
      const updated = await updateFollowUp(candidateId, { status });
      setCandidates((prev) =>
        prev.map((c) => (c.id === candidateId ? updated : c)),
      );
    } catch (e) {
      console.error(e);
    }
  };

  // 音信不通アラート
  const overdueCandidates = candidates.filter(
    (c) => c.days_since_contact > 7 && !["placed", "lost"].includes(c.status),
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">面談後フォローアップ</h1>
      <p className="text-sm text-gray-500 mb-6">
        候補者をグリップし続けるためのアクション管理
      </p>

      {/* 音信不通アラート */}
      {overdueCandidates.length > 0 && (
        <div className="rounded-xl bg-red-50 border border-red-200 p-4 mb-6">
          <h3 className="text-sm font-bold text-red-800 mb-2">
            要対応: {overdueCandidates.length} 名が7日以上未連絡
          </h3>
          <div className="flex flex-wrap gap-2">
            {overdueCandidates.map((c) => (
              <span key={c.id} className="rounded-full bg-red-100 px-3 py-1 text-xs text-red-700">
                {c.name}（{c.days_since_contact}日前）
              </span>
            ))}
          </div>
        </div>
      )}

      {/* フィルター */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {[
          { key: "all", label: "全て" },
          { key: "in_progress", label: "進行中" },
          { key: "new", label: "新規" },
          { key: "on_hold", label: "保留" },
          { key: "overdue", label: "期限超過" },
          { key: "placed", label: "成約" },
          { key: "lost", label: "離脱" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              filter === key
                ? "bg-primary-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-gray-400 py-4">読み込み中…</p>}

      {/* 候補者カード一覧 */}
      <div className="space-y-4">
        {candidates.map((c) => {
          const statusInfo = STATUS_LABELS[c.status] || STATUS_LABELS.new;
          const priorityInfo = PRIORITY_LABELS[c.follow_up_priority] || PRIORITY_LABELS.medium;
          const isOverdue = c.days_since_contact > 7 && !["placed", "lost"].includes(c.status);

          return (
            <div
              key={c.id}
              className={`rounded-xl bg-white shadow-sm border p-5 ${
                isOverdue ? "border-red-300" : "border-gray-200"
              }`}
            >
              {/* ヘッダー */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-gray-900">{c.name}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                    {isOverdue && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 animate-pulse">
                        {c.days_since_contact}日未連絡
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {c.current_company} / {c.current_position}
                  </p>
                </div>
                <div className="flex gap-1">
                  <select
                    value={c.status}
                    onChange={(e) => handleStatusChange(c.id, e.target.value)}
                    className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
                  >
                    {Object.entries(STATUS_LABELS).map(([key, { label }]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* キーワード + 紹介企業 */}
              <div className="flex flex-wrap gap-1 mt-2">
                {c.desired_keywords.map((kw) => (
                  <span key={kw} className="rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-700">{kw}</span>
                ))}
              </div>

              {c.matched_companies.length > 0 && (
                <div className="mt-2 text-xs text-gray-500">
                  紹介候補: {c.matched_companies.map((mc: Record<string, unknown>) => mc.name as string).join("、")}
                </div>
              )}

              {/* フォローアップ設定 */}
              <div className="mt-3 flex items-center gap-3 text-sm">
                <span className={`rounded border px-2 py-0.5 text-xs font-medium ${priorityInfo.color}`}>
                  優先度: {priorityInfo.label}
                </span>
                {c.follow_up_date && (
                  <span className="text-xs text-gray-500">
                    次回: {new Date(c.follow_up_date).toLocaleDateString("ja-JP")}
                  </span>
                )}
                {c.follow_up_notes && (
                  <span className="text-xs text-gray-400">{c.follow_up_notes}</span>
                )}
                <button
                  onClick={() => {
                    setFollowUpEditing(followUpEditing === c.id ? null : c.id);
                    setFuDate(c.follow_up_date?.split("T")[0] || "");
                    setFuPriority(c.follow_up_priority);
                    setFuNotes(c.follow_up_notes || "");
                  }}
                  className="text-xs text-primary-600 hover:underline"
                >
                  編集
                </button>
              </div>

              {followUpEditing === c.id && (
                <div className="mt-3 rounded-lg bg-gray-50 p-3 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs text-gray-600 mb-0.5">次回フォロー日</label>
                      <input type="date" value={fuDate} onChange={(e) => setFuDate(e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-0.5">優先度</label>
                      <select value={fuPriority} onChange={(e) => setFuPriority(e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs">
                        <option value="high">高</option>
                        <option value="medium">中</option>
                        <option value="low">低</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-0.5">メモ</label>
                      <input type="text" value={fuNotes} onChange={(e) => setFuNotes(e.target.value)}
                        className="w-full rounded border border-gray-300 px-2 py-1 text-xs" placeholder="条件提示済み" />
                    </div>
                  </div>
                  <button
                    onClick={() => handleFollowUpSave(c.id)}
                    className="rounded bg-primary-600 px-3 py-1 text-xs font-medium text-white hover:bg-primary-700"
                  >
                    保存
                  </button>
                </div>
              )}

              {/* アクション履歴 */}
              {c.action_history.length > 0 && (
                <div className="mt-3 border-t pt-3">
                  <h4 className="text-xs font-semibold text-gray-600 mb-1">アクション履歴</h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {[...c.action_history].reverse().map((a, i) => (
                      <div key={i} className="flex gap-2 text-xs">
                        <span className="text-gray-400 min-w-[70px]">{a.date}</span>
                        <span className="text-gray-700">{a.action}</span>
                        {a.result && <span className="text-gray-500">→ {a.result}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 新規アクション追加 */}
              <div className="mt-3 border-t pt-3">
                <div className="flex flex-wrap gap-1 mb-2">
                  {ACTION_TEMPLATES.map((tmpl) => (
                    <button
                      key={tmpl}
                      onClick={() => setActionInput((prev) => ({ ...prev, [c.id]: tmpl }))}
                      className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-200"
                    >
                      {tmpl}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={actionInput[c.id] || ""}
                    onChange={(e) => setActionInput((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    placeholder="アクション内容…"
                    className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <input
                    type="text"
                    value={resultInput[c.id] || ""}
                    onChange={(e) => setResultInput((prev) => ({ ...prev, [c.id]: e.target.value }))}
                    placeholder="結果（任意）"
                    className="flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                  />
                  <button
                    onClick={() => handleAction(c.id)}
                    disabled={!actionInput[c.id]}
                    className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    記録
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!loading && candidates.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          該当する候補者がいません
        </div>
      )}
    </div>
  );
}
