import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchCandidates,
  saveMeetingNotes,
  matchCompanies,
  matchJobs,
  type CandidateItem,
  type MatchedCompany,
  type JobMatchResult,
} from "../api/client";

const KEYWORD_SUGGESTIONS = [
  "施工管理", "設備管理", "ビルメン", "発注者側", "年収UP",
  "残業少ない", "資格手当", "土木", "建築", "電気",
  "マネジメント", "ワークライフバランス", "転勤なし", "元請",
];

export default function MeetingAssist() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [discoveredKws, setDiscoveredKws] = useState<string[]>([]);
  const [companyMatches, setCompanyMatches] = useState<MatchedCompany[]>([]);
  const [jobMatches, setJobMatches] = useState<JobMatchResult[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data } = useQuery({
    queryKey: ["candidates-active"],
    queryFn: () => fetchCandidates("in_progress"),
  });

  const candidates = data?.candidates || [];
  const selected = candidates.find((c) => c.id === selectedId);

  const toggleKw = (kw: string) => {
    const updated = discoveredKws.includes(kw)
      ? discoveredKws.filter((k) => k !== kw)
      : [...discoveredKws, kw];
    setDiscoveredKws(updated);
    runMatching(updated);
  };

  const runMatching = async (keywords: string[]) => {
    if (keywords.length === 0) { setCompanyMatches([]); setJobMatches([]); return; }
    try {
      const [compRes, jobRes] = await Promise.all([
        matchCompanies(keywords),
        selectedId ? matchJobs({ candidate_id: selectedId }) : matchJobs({ keywords }),
      ]);
      setCompanyMatches(compRes.results);
      setJobMatches(jobRes.results);
    } catch { /* ignore */ }
  };

  const handleSave = async () => {
    if (!selectedId) return;
    setSaving(true);
    try {
      await saveMeetingNotes(selectedId, notes, discoveredKws);
      setSaved(true);
      qc.invalidateQueries({ queryKey: ["candidates"] });
      setTimeout(() => setSaved(false), 3000);
    } catch (e) { console.error(e); }
    setSaving(false);
  };

  const handleSelect = (c: CandidateItem) => {
    setSelectedId(c.id);
    setNotes(c.meeting_notes || "");
    setDiscoveredKws(c.desired_keywords || []);
    setSaved(false);
    if (c.desired_keywords && c.desired_keywords.length > 0) {
      runMatching(c.desired_keywords);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">面談中サポート</h1>
        <p className="text-sm text-gray-500 mt-1">リアルタイムでキーワード発見 → 企業・求人マッチング → メモ記録</p>
      </div>

      {/* 候補者選択 */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        {candidates.map((c) => (
          <button key={c.id} onClick={() => handleSelect(c)}
            className={`flex-shrink-0 rounded-lg border px-4 py-2 text-sm transition-colors ${selectedId === c.id ? "border-primary-500 bg-primary-50 text-primary-700 font-medium" : "border-gray-200 bg-white hover:border-gray-300"}`}>
            {c.name}
            <span className="text-xs text-gray-400 ml-1">({c.current_position || "未設定"})</span>
          </button>
        ))}
        {candidates.length === 0 && <p className="text-sm text-gray-400 py-2">「面談前準備」で候補者を登録し、ステータスを「進行中」にしてください</p>}
      </div>

      {selected && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左: メモ + キーワード */}
          <div className="space-y-4">
            {/* AI推定ニーズ */}
            {selected.inferred_needs && Object.keys(selected.inferred_needs).length > 0 && (
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
                <h3 className="text-sm font-semibold text-blue-800 mb-2">AI推定ニーズ（面談前分析）</h3>
                {!!(selected.inferred_needs as Record<string, unknown>).likely_pain_points && (
                  <div className="mb-2">
                    <span className="text-xs text-blue-600 font-medium">推定課題: </span>
                    <span className="text-sm text-blue-900">{((selected.inferred_needs as Record<string, unknown>).likely_pain_points as string[]).join("、")}</span>
                  </div>
                )}
                {!!(selected.inferred_needs as Record<string, unknown>).motivation && (
                  <div className="mb-2">
                    <span className="text-xs text-blue-600 font-medium">転職動機: </span>
                    <span className="text-sm text-blue-900">{(selected.inferred_needs as Record<string, unknown>).motivation as string}</span>
                  </div>
                )}
                {!!(selected.inferred_needs as Record<string, unknown>).recommended_approach && (
                  <div>
                    <span className="text-xs text-blue-600 font-medium">推奨アプローチ: </span>
                    <span className="text-sm text-blue-900">{(selected.inferred_needs as Record<string, unknown>).recommended_approach as string}</span>
                  </div>
                )}
              </div>
            )}

            {/* 面談メモ */}
            <div className="rounded-xl bg-white border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">面談メモ</h3>
              <textarea
                className="w-full border rounded-lg px-3 py-2 text-sm min-h-[200px]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="候補者の発言、要望、印象をメモ..."
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400">{notes.length}文字</span>
                <div className="flex gap-2">
                  {saved && <span className="text-xs text-green-600">保存しました</span>}
                  <button onClick={handleSave} disabled={saving}
                    className="px-4 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">
                    {saving ? "保存中..." : "メモを保存"}
                  </button>
                </div>
              </div>
            </div>

            {/* キーワード発見 */}
            <div className="rounded-xl bg-white border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">キーワード発見</h3>
              <p className="text-xs text-gray-400 mb-3">面談中に出てきたキーワードをタップ → リアルタイムでマッチング</p>
              <div className="flex flex-wrap gap-2">
                {KEYWORD_SUGGESTIONS.map((kw) => (
                  <button key={kw} onClick={() => toggleKw(kw)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      discoveredKws.includes(kw) ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}>
                    {kw}
                  </button>
                ))}
              </div>
              {discoveredKws.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-1">選択中: {discoveredKws.length}個</p>
                  <div className="flex flex-wrap gap-1">
                    {discoveredKws.map((kw) => (
                      <span key={kw} className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-700">
                        {kw}
                        <button onClick={() => toggleKw(kw)}>&times;</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 右: マッチング結果 */}
          <div className="space-y-4">
            {/* 企業マッチング */}
            <div className="rounded-xl bg-white border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                企業マッチング
                {companyMatches.length > 0 && <span className="text-xs text-gray-400 ml-2">({companyMatches.length}件)</span>}
              </h3>
              {companyMatches.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">キーワードを選択するとマッチ企業が表示されます</p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {companyMatches.map((m) => (
                    <div key={m.company.id} className="rounded-lg border border-gray-100 p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{m.company.name}</span>
                        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">スコア {m.match_score}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {m.matched_keywords.map((kw) => <span key={kw} className="text-xs bg-orange-50 text-orange-600 px-1.5 py-0.5 rounded">{kw}</span>)}
                      </div>
                      {m.pitch_summary.length > 0 && (
                        <div className="mt-2 text-xs text-gray-600">
                          {m.pitch_summary.slice(0, 2).map((p, i) => <p key={i}>{p}</p>)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 求人マッチング */}
            <div className="rounded-xl bg-white border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                求人マッチング
                {jobMatches.length > 0 && <span className="text-xs text-gray-400 ml-2">({jobMatches.length}件)</span>}
              </h3>
              {jobMatches.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">マッチする求人が見つかるとここに表示されます</p>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {jobMatches.map((r) => (
                    <div key={r.job.id} className="rounded-lg border border-gray-100 p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium text-sm">{r.job.title}</span>
                          {r.job.companies && <span className="text-xs text-gray-500 ml-1">({r.job.companies.name})</span>}
                        </div>
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">スコア {r.match_score}</span>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {r.matched_keywords.map((kw) => <span key={kw} className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded">{kw}</span>)}
                      </div>
                      {(r.job.salary_min || r.job.salary_max) && (
                        <p className="text-xs text-gray-500 mt-1">{r.job.salary_min}〜{r.job.salary_max}万円 / {r.job.location || "勤務地未定"}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
