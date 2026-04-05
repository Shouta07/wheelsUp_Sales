import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchRecommendations,
  fetchCandidates,
  fetchCompanies,
  fetchDeals,
  createRecommendation,
  updateRecommendation,
  type RecommendationItem,
} from "../api/client";

const STATUS_LABELS: Record<string, string> = {
  proposed: "提案中",
  screening: "書類選考",
  interviewing: "面接中",
  offered: "内定",
  placed: "成約",
  rejected: "見送り",
  withdrawn: "辞退",
};

const STATUS_COLORS: Record<string, string> = {
  proposed: "bg-blue-100 text-blue-700",
  screening: "bg-yellow-100 text-yellow-700",
  interviewing: "bg-orange-100 text-orange-700",
  offered: "bg-purple-100 text-purple-700",
  placed: "bg-green-100 text-green-700",
  rejected: "bg-gray-100 text-gray-500",
  withdrawn: "bg-gray-100 text-gray-500",
};

export default function Recommendations() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newCandidateId, setNewCandidateId] = useState("");
  const [newCompanyId, setNewCompanyId] = useState("");
  const [newDealId, setNewDealId] = useState("");
  const [filter, setFilter] = useState<string>("active");

  const { data: recsData } = useQuery({
    queryKey: ["recommendations-all"],
    queryFn: () => fetchRecommendations(),
  });
  const { data: candidatesData } = useQuery({
    queryKey: ["candidates-all"],
    queryFn: () => fetchCandidates(),
  });
  const { data: companiesData } = useQuery({
    queryKey: ["companies-all"],
    queryFn: () => fetchCompanies(),
  });
  const { data: dealsData } = useQuery({
    queryKey: ["deals-open"],
    queryFn: () => fetchDeals("open"),
  });

  const allRecs = recsData?.recommendations || [];
  const candidates = candidatesData?.candidates || [];
  const companies = companiesData?.companies || [];
  const deals = dealsData?.deals || [];

  const filteredRecs = filter === "active"
    ? allRecs.filter((r) => !["placed", "rejected", "withdrawn"].includes(r.status))
    : filter === "closed"
    ? allRecs.filter((r) => ["placed", "rejected", "withdrawn"].includes(r.status))
    : allRecs;

  const createMut = useMutation({
    mutationFn: () => createRecommendation(newCandidateId, newCompanyId, newDealId || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recommendations-all"] });
      qc.invalidateQueries({ queryKey: ["recommendations-active"] });
      setShowCreate(false);
      setNewCandidateId("");
      setNewCompanyId("");
      setNewDealId("");
    },
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateRecommendation(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recommendations-all"] });
      qc.invalidateQueries({ queryKey: ["recommendations-active"] });
    },
  });

  const phaseProgress = (rec: RecommendationItem) => {
    const total = 8 * 5 + 8 * 5; // rough estimate
    const checked = [
      ...rec.phase1_candidate, ...rec.phase1_company,
      ...rec.phase2_candidate, ...rec.phase2_company,
      ...rec.phase3_candidate, ...rec.phase3_company,
      ...rec.phase4_candidate, ...rec.phase4_company,
    ].length;
    // Count actual items per phase
    const totalItems = 5 + 5 + 8 + 8 + 6 + 6 + 8 + 8; // from all phase pages
    return { checked, total: totalItems, pct: totalItems > 0 ? Math.round((checked / totalItems) * 100) : 0 };
  };

  // Build candidate→company matrix for analysis
  const candidateIds = [...new Set(allRecs.map((r) => r.candidate_id))];
  const companyIds = [...new Set(allRecs.map((r) => r.company_id))];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">推薦管理</h1>
          <p className="text-sm text-gray-500 mt-1">候補者×企業のペアを作成・管理。全フェーズの進捗を俯瞰する</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700">
          + 新規推薦
        </button>
      </div>

      {/* 新規作成フォーム */}
      {showCreate && (
        <div className="mb-6 rounded-xl bg-white border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">新規推薦を作成</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">候補者</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={newCandidateId} onChange={(e) => setNewCandidateId(e.target.value)}>
                <option value="">選択...</option>
                {candidates.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.current_position || "未設定"})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">企業</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={newCompanyId} onChange={(e) => setNewCompanyId(e.target.value)}>
                <option value="">選択...</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.industry || "未設定"})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Pipedrive Deal（任意）</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={newDealId} onChange={(e) => setNewDealId(e.target.value)}>
                <option value="">未連携</option>
                {deals.map((d) => <option key={d.id} value={d.id}>{d.title} ({d.stage_name})</option>)}
              </select>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => createMut.mutate()} disabled={!newCandidateId || !newCompanyId || createMut.isPending}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {createMut.isPending ? "作成中..." : "作成"}
            </button>
            {createMut.isError && <p className="text-xs text-red-600 self-center">{(createMut.error as Error).message}</p>}
          </div>
        </div>
      )}

      {/* フィルター */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        {[["active", "進行中"], ["closed", "完了"], ["all", "全て"]].map(([key, label]) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${filter === key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
            {label} ({key === "active" ? allRecs.filter((r) => !["placed", "rejected", "withdrawn"].includes(r.status)).length : key === "closed" ? allRecs.filter((r) => ["placed", "rejected", "withdrawn"].includes(r.status)).length : allRecs.length})
          </button>
        ))}
      </div>

      {/* 推薦一覧 */}
      <div className="space-y-3">
        {filteredRecs.map((rec) => {
          const progress = phaseProgress(rec);
          const leadDays = Math.floor((Date.now() - new Date(rec.proposed_at).getTime()) / 86400000);
          return (
            <div key={rec.id} className="rounded-xl bg-white border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-900">{rec.candidates.name}</span>
                  <span className="text-gray-400">→</span>
                  <span className="font-medium text-gray-900">{rec.companies.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[rec.status]}`}>
                    {STATUS_LABELS[rec.status]}
                  </span>
                  {rec.deal_id && <span className="text-xs text-indigo-600">Deal連携</span>}
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-xs ${leadDays > 30 ? "text-red-600 font-medium" : "text-gray-400"}`}>
                    {leadDays}日経過
                  </span>
                  <select className="border rounded px-2 py-1 text-xs" value={rec.status}
                    onChange={(e) => statusMut.mutate({ id: rec.id, status: e.target.value })}>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>{rec.candidates.current_position || "未設定"}</span>
                <span>|</span>
                <span>{rec.companies.industry || "未設定"}</span>
                <span>|</span>
                <div className="flex items-center gap-2 flex-1">
                  <span>進捗 {progress.pct}%</span>
                  <div className="flex-1 max-w-[200px] bg-gray-200 rounded-full h-1.5">
                    <div className="bg-primary-600 h-1.5 rounded-full transition-all" style={{ width: `${progress.pct}%` }} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {filteredRecs.length === 0 && (
          <div className="rounded-xl bg-white border border-gray-200 p-12 text-center text-gray-400">
            <p className="text-lg mb-2">推薦案件がありません</p>
            <p className="text-xs">「+ 新規推薦」から候補者×企業ペアを作成してください</p>
          </div>
        )}
      </div>

      {/* マトリクス表示（候補者が複数企業にまたがる場合の可視化） */}
      {candidateIds.length > 1 && companyIds.length > 1 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">候補者×企業マトリクス</h2>
          <div className="overflow-x-auto">
            <table className="text-xs border-collapse">
              <thead>
                <tr>
                  <th className="border border-gray-200 px-3 py-2 bg-gray-50"></th>
                  {companyIds.map((cid) => {
                    const company = allRecs.find((r) => r.company_id === cid)?.companies;
                    return <th key={cid} className="border border-gray-200 px-3 py-2 bg-gray-50 font-medium">{company?.name || "?"}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {candidateIds.map((canId) => {
                  const candidate = allRecs.find((r) => r.candidate_id === canId)?.candidates;
                  return (
                    <tr key={canId}>
                      <td className="border border-gray-200 px-3 py-2 font-medium bg-gray-50">{candidate?.name || "?"}</td>
                      {companyIds.map((comId) => {
                        const rec = allRecs.find((r) => r.candidate_id === canId && r.company_id === comId);
                        return (
                          <td key={comId} className="border border-gray-200 px-3 py-2 text-center">
                            {rec ? (
                              <span className={`px-2 py-0.5 rounded-full ${STATUS_COLORS[rec.status]}`}>
                                {STATUS_LABELS[rec.status]}
                              </span>
                            ) : (
                              <span className="text-gray-300">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
