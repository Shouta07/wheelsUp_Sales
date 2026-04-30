import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import {
  fetchRecommendations,
  generateCandidateBriefing,
  matchJobs,
  type RecommendationItem,
  type JobMatchResult,
} from "../api/client";
import { useRecommendationChecklist } from "../hooks/usePhaseProgress";
import PhaseCoaching from "../components/gamification/PhaseCoaching";

const CANDIDATE_ITEMS = [
  { section: "候補者情報の把握", items: [
    { id: "c1", label: "Pipedrive で登録情報・前回接触メモを確認", hint: "「初回か継続か」で温度感が変わる", tag: "必須" },
    { id: "c2", label: "転職動機カテゴリの仮説を立てる", hint: "年収・環境・キャリア・ライフイベントのどれか", tag: "必須" },
    { id: "c3", label: "保有資格・現職・年収・希望地域を確認", tag: "必須" },
  ]},
  { section: "面談設計", items: [
    { id: "c4", label: "マッチしそうな求人を2〜3件ピックアップ", hint: "面談中に「こういう求人があります」と示せると信頼UP", tag: "推奨" },
    { id: "c5", label: "「この面談で決めること」を1行で書く", hint: "例：希望条件の優先順位と応募意欲を確認する", tag: "必須" },
  ]},
];

const COMPANY_ITEMS = [
  { section: "企業情報の把握", items: [
    { id: "b1", label: "Pipedrive で過去接触・料率・業種を確認", tag: "必須" },
    { id: "b2", label: "採用背景の仮説を3つ立てる", hint: "欠員・拡大・DX・高齢化対応のどれか", tag: "必須" },
    { id: "b3", label: "企業サイト・採用ページを5分で確認", tag: "推奨" },
  ]},
  { section: "商談設計", items: [
    { id: "b4", label: "提示できる候補者スペック（匿名）を1件準備", hint: "「今こういう方がいます」で商談を具体化させる", tag: "差別化" },
    { id: "b5", label: "アジェンダを24時間前に送付", hint: "ドタキャン率が下がる。主導権を握る", tag: "差別化" },
  ]},
];

const TAG_COLORS: Record<string, string> = {
  "必須": "bg-red-100 text-red-700",
  "推奨": "bg-orange-100 text-orange-700",
  "差別化": "bg-blue-100 text-blue-700",
};

export default function Phase1Prep() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["recommendations-active"],
    queryFn: () => fetchRecommendations(),
  });

  const recommendations = (data?.recommendations || []).filter(
    (r) => r.status !== "placed" && r.status !== "rejected" && r.status !== "withdrawn",
  );
  const selected = recommendations.find((r) => r.id === selectedId);

  const candidateChecklist = useRecommendationChecklist(selectedId, 1, "candidate", selected?.phase1_candidate || []);
  const companyChecklist = useRecommendationChecklist(selectedId, 1, "company", selected?.phase1_company || []);

  // AI Briefing
  const [briefing, setBriefing] = useState<string | null>(null);
  const briefingMut = useMutation({
    mutationFn: (candidateId: string) => generateCandidateBriefing(candidateId),
    onSuccess: (res) => {
      setBriefing(res.briefing);
      qc.invalidateQueries({ queryKey: ["recommendations-active"] });
    },
  });

  // Job matching
  const [jobMatches, setJobMatches] = useState<JobMatchResult[]>([]);
  const [matchingJobs, setMatchingJobs] = useState(false);
  const runJobMatch = async (candidateId: string) => {
    setMatchingJobs(true);
    try {
      const res = await matchJobs({ candidate_id: candidateId });
      setJobMatches(res.results);
    } catch { /* ignore */ }
    setMatchingJobs(false);
  };

  const handleSelect = (rec: RecommendationItem) => {
    if (selectedId === rec.id) { setSelectedId(null); return; }
    setSelectedId(rec.id);
    setBriefing(null);
    setJobMatches([]);
  };

  const totalC = CANDIDATE_ITEMS.flatMap((s) => s.items).length;
  const totalB = COMPANY_ITEMS.flatMap((s) => s.items).length;

  const renderChecklist = (
    sections: typeof CANDIDATE_ITEMS,
    checked: Record<string, boolean>,
    toggle: (id: string) => void,
    disabled: boolean,
  ) =>
    sections.map((section) => (
      <div key={section.section} className="mb-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{section.section}</h3>
        <div className="space-y-3">
          {section.items.map((item) => (
            <label key={item.id} className={`flex items-start gap-3 ${disabled ? "opacity-40" : "cursor-pointer"}`}>
              <input type="checkbox" checked={!!checked[item.id]} onChange={() => !disabled && toggle(item.id)} disabled={disabled} className="mt-0.5 w-4 h-4 rounded border-gray-300" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${checked[item.id] ? "line-through text-gray-400" : "text-gray-900"}`}>{item.label}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${TAG_COLORS[item.tag]}`}>{item.tag}</span>
                </div>
                {"hint" in item && item.hint && <p className="text-xs text-gray-400 mt-0.5">{item.hint}</p>}
              </div>
            </label>
          ))}
        </div>
      </div>
    ));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">① 前準備</h1>
        <p className="text-sm text-gray-500 mt-1">24時間前までに完了 ─ 仮説を立て、マッチ求人を準備して面談に臨む</p>
      </div>

      {/* 推薦案件選択 */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">推薦案件を選択（候補者 → 企業）</h2>
        {recommendations.length === 0 ? (
          <div className="rounded-lg bg-gray-50 border border-dashed border-gray-300 p-4 text-center">
            <p className="text-sm text-gray-500">推薦案件がありません</p>
            <a href="/recommendations" className="text-xs text-primary-600 hover:text-primary-700 mt-1 inline-block">候補者×企業ペアを作成する →</a>
          </div>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {recommendations.map((rec) => (
              <button key={rec.id} onClick={() => handleSelect(rec)}
                className={`flex-shrink-0 rounded-lg border px-4 py-2 text-sm transition-colors ${selectedId === rec.id ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                <span className="font-medium">{rec.candidates.name}</span>
                <span className="text-gray-400 mx-1">→</span>
                <span className="font-medium">{rec.companies.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <>
          {/* AI仮説・ブリーフィング */}
          <div className="mb-6 rounded-xl bg-blue-50 border border-blue-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-blue-800">AI仮説出力</h3>
              <div className="flex gap-2">
                <button onClick={() => runJobMatch(selected.candidate_id)} disabled={matchingJobs}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50">
                  {matchingJobs ? "検索中..." : "マッチ求人を検索"}
                </button>
                <button onClick={() => briefingMut.mutate(selected.candidate_id)} disabled={briefingMut.isPending}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50">
                  {briefingMut.isPending ? "生成中..." : "AIブリーフィング生成"}
                </button>
              </div>
            </div>

            {/* 候補者推定ニーズ */}
            {selected.candidates.inferred_needs && Object.keys(selected.candidates.inferred_needs).length > 0 && (
              <div className="rounded-lg bg-white border border-blue-100 p-3 mb-3">
                <h4 className="text-xs font-semibold text-blue-700 mb-1">推定ニーズ（既存データ）</h4>
                {!!(selected.candidates.inferred_needs as Record<string, unknown>).likely_pain_points && (
                  <div className="text-sm text-blue-900 mb-1">
                    <span className="text-xs text-blue-600 font-medium">課題: </span>
                    {((selected.candidates.inferred_needs as Record<string, unknown>).likely_pain_points as string[]).join("、")}
                  </div>
                )}
                {!!(selected.candidates.inferred_needs as Record<string, unknown>).motivation && (
                  <div className="text-sm text-blue-900">
                    <span className="text-xs text-blue-600 font-medium">動機: </span>
                    {(selected.candidates.inferred_needs as Record<string, unknown>).motivation as string}
                  </div>
                )}
              </div>
            )}

            {briefing && (
              <div className="rounded-lg bg-white border border-blue-100 p-3 prose prose-sm max-w-none text-sm max-h-[400px] overflow-y-auto">
                <ReactMarkdown>{briefing}</ReactMarkdown>
              </div>
            )}
          </div>

          {/* マッチ求人 */}
          {jobMatches.length > 0 && (
            <div className="mb-6 rounded-xl bg-green-50 border border-green-200 p-5">
              <h3 className="text-sm font-semibold text-green-800 mb-3">マッチ求人（{jobMatches.length}件）</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {jobMatches.slice(0, 6).map((r) => (
                  <div key={r.job.id} className="rounded-lg bg-white border border-green-100 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{r.job.title}</span>
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">スコア {r.match_score}</span>
                    </div>
                    {r.job.companies && <p className="text-xs text-gray-500">{r.job.companies.name}</p>}
                    {(r.job.salary_min || r.job.salary_max) && (
                      <p className="text-xs text-gray-500 mt-1">{r.job.salary_min}〜{r.job.salary_max}万円 / {r.job.location || "勤務地未定"}</p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {r.matched_keywords.map((kw) => <span key={kw} className="text-xs bg-green-50 text-green-600 px-1.5 py-0.5 rounded">{kw}</span>)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Deal情報 */}
          {selected.deal && (
            <div className="mb-4 rounded-lg bg-indigo-50 border border-indigo-200 p-3 flex items-center justify-between">
              <div className="flex items-center gap-3 text-sm">
                <span className="font-medium text-indigo-800">Pipedrive Deal:</span>
                <span className="text-indigo-700">{selected.deal.title}</span>
                <span className="text-xs text-indigo-500">ステージ: {selected.deal.stage_name}</span>
              </div>
            </div>
          )}

          {/* AIコーチング */}
          <div className="mb-6">
            <PhaseCoaching
              phase={1}
              candidateId={selected.candidate_id}
              companyId={selected.company_id}
              dealId={selected.deal_id || undefined}
              candidateName={selected.candidates.name}
              companyName={selected.companies.name}
            />
          </div>

          {/* チェックリスト */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl bg-white border border-gray-200 p-5">
              <h2 className="text-center text-sm font-bold text-gray-700 mb-3 pb-2 border-b">TO 候補者 面談前</h2>
              <div className="mb-3 rounded-lg bg-gray-50 p-3 text-xs text-gray-600 space-y-1">
                <div className="font-medium text-gray-800">{selected.candidates.name}</div>
                <div className="flex gap-3 flex-wrap">
                  <span>{selected.candidates.current_position || "未設定"}</span>
                  <span>年収 {selected.candidates.current_salary ? `${selected.candidates.current_salary}万` : "未設定"}</span>
                  <span>資格 {selected.candidates.qualifications?.join(", ") || "未設定"}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex-1 bg-gray-200 rounded-full h-1.5"><div className="bg-primary-600 h-1.5 rounded-full transition-all" style={{ width: `${(candidateChecklist.checkedCount / totalC) * 100}%` }} /></div>
                <span className="text-xs text-gray-400">{candidateChecklist.checkedCount}/{totalC}</span>
              </div>
              {renderChecklist(CANDIDATE_ITEMS, candidateChecklist.checked, candidateChecklist.toggle, false)}
            </div>

            <div className="rounded-xl bg-white border border-gray-200 p-5">
              <h2 className="text-center text-sm font-bold text-gray-700 mb-3 pb-2 border-b">TO 求人企業 商談前</h2>
              <div className="mb-3 rounded-lg bg-gray-50 p-3 text-xs text-gray-600 space-y-1">
                <div className="font-medium text-gray-800">{selected.companies.name}</div>
                <div className="flex gap-3"><span>{selected.companies.industry || "未設定"}</span><span>{selected.companies.address || "未設定"}</span></div>
                {selected.companies.keywords?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">{selected.companies.keywords.slice(0, 5).map((kw) => <span key={kw} className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded text-xs">{kw}</span>)}</div>
                )}
              </div>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex-1 bg-gray-200 rounded-full h-1.5"><div className="bg-primary-600 h-1.5 rounded-full transition-all" style={{ width: `${(companyChecklist.checkedCount / totalB) * 100}%` }} /></div>
                <span className="text-xs text-gray-400">{companyChecklist.checkedCount}/{totalB}</span>
              </div>
              {renderChecklist(COMPANY_ITEMS, companyChecklist.checked, companyChecklist.toggle, false)}
            </div>
          </div>
        </>
      )}

      <div className="mt-6 rounded-xl bg-amber-50 border border-amber-300 p-4 text-center">
        <p className="text-sm font-medium text-amber-800">
          両面連携チェック ─ 候補者面談と企業商談のスケジュールを近づける。候補者情報を持って企業商談に臨むとリアリティが増す
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div />
        <span className="text-xs text-gray-400">① 前準備 1/4</span>
        <button onClick={() => navigate("/meeting")} className="px-4 py-2 text-sm font-medium text-primary-700 hover:text-primary-800">次のフェーズ →</button>
      </div>
    </div>
  );
}
