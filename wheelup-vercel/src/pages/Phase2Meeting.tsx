import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  fetchRecommendations,
  matchCompanies,
  matchJobs,
  type RecommendationItem,
  type MatchedCompany,
  type JobMatchResult,
} from "../api/client";
import { useRecommendationChecklist } from "../hooks/usePhaseProgress";

const KEYWORD_SUGGESTIONS = [
  "施工管理", "設備管理", "ビルメン", "発注者側", "年収UP",
  "残業少ない", "資格手当", "土木", "建築", "電気",
  "マネジメント", "ワークライフバランス", "転勤なし", "元請",
];

const CANDIDATE_SECTIONS = [
  { section: "転職動機の深掘り（最重要）", items: [
    { id: "cq1", label: "Q1: 今の転職を考えたきっかけは？", hint: "表面的な答えの奥を「具体的には？」で2回掘る", tag: "最重要" },
    { id: "cq2", label: "Q2: 今の会社の不満 vs 次の会社への希望", hint: "「不満」は動機、「希望」は条件整理に使う", tag: "最重要" },
    { id: "cq3", label: "Q3: 転職の優先順位（年収/環境/仕事内容/場所）", hint: "どれが外せないかで推薦先が絞れる", tag: "必須" },
  ]},
  { section: "条件確認", items: [
    { id: "cq4", label: "Q4: 希望年収（下限・理想）と現年収", tag: "必須" },
    { id: "cq5", label: "Q5: 勤務地・リモート希望と転職時期", tag: "必須" },
    { id: "cq6", label: "Q6: 絶対NGな会社・条件（地雷確認）", hint: "ここを押さえないとミスマッチ紹介になる", tag: "必須" },
  ]},
  { section: "クロージング", items: [
    { id: "cq7", label: "Q7: 他社エージェント利用状況", hint: "並走なら「弊社独自案件」を強調する", tag: "確認" },
    { id: "cq8", label: "「3日以内に求人を送ります」と期日を宣言", hint: "これが言えるかどうかが面談の質を決める", tag: "必須" },
  ]},
];

const COMPANY_SECTIONS = [
  { section: "採用ニーズの深掘り（最重要）", items: [
    { id: "bq1", label: "Q1: 採用背景（欠員・拡大・DX・高齢化）", tag: "最重要" },
    { id: "bq2", label: "Q2: 現社員の構成（年齢・資格保有状況）", hint: "高齢化・若手不足の深刻度がここでわかる", tag: "最重要" },
    { id: "bq3", label: "Q3: 担当業務・案件規模・資格要件", tag: "必須" },
  ]},
  { section: "条件確認", items: [
    { id: "bq4", label: "Q4: 年収レンジ（下限・上限）と残業実態", hint: "ここを��かないと候補者に嘘をつくことになる", tag: "最重要" },
    { id: "bq5", label: "Q5: 採用フロー・面接回数・意思決定者", tag: "必須" },
    { id: "bq6", label: "Q6: 採用期限と他社エージェント並走状況", tag: "確認" },
  ]},
  { section: "クロージング", items: [
    { id: "bq7", label: "料率・支払条件・保証期間を口頭合意", tag: "必須" },
    { id: "bq8", label: "「○日までに候補者を送ります」と期日宣言", tag: "最重要" },
  ]},
];

const TAG_COLORS: Record<string, string> = {
  "最重要": "bg-red-100 text-red-700",
  "必須": "bg-orange-100 text-orange-700",
  "確認": "bg-gray-100 text-gray-600",
};

export default function Phase2Meeting() {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [discoveredKws, setDiscoveredKws] = useState<string[]>([]);
  const [jobMatches, setJobMatches] = useState<JobMatchResult[]>([]);
  const [companyMatches, setCompanyMatches] = useState<MatchedCompany[]>([]);
  const [notes, setNotes] = useState("");

  const { data } = useQuery({
    queryKey: ["recommendations-active"],
    queryFn: () => fetchRecommendations(),
  });

  const recommendations = (data?.recommendations || []).filter(
    (r) => r.status !== "placed" && r.status !== "rejected" && r.status !== "withdrawn",
  );
  const selected = recommendations.find((r) => r.id === selectedId);

  const candidateChecklist = useRecommendationChecklist(selectedId, 2, "candidate", selected?.phase2_candidate || []);
  const companyChecklist = useRecommendationChecklist(selectedId, 2, "company", selected?.phase2_company || []);

  const toggleKw = (kw: string) => {
    const updated = discoveredKws.includes(kw)
      ? discoveredKws.filter((k) => k !== kw)
      : [...discoveredKws, kw];
    setDiscoveredKws(updated);
    runMatching(updated);
  };

  const runMatching = async (keywords: string[]) => {
    if (keywords.length === 0) { setJobMatches([]); setCompanyMatches([]); return; }
    try {
      const [compRes, jobRes] = await Promise.all([
        matchCompanies(keywords),
        selected ? matchJobs({ candidate_id: selected.candidate_id }) : matchJobs({ keywords }),
      ]);
      setCompanyMatches(compRes.results);
      setJobMatches(jobRes.results);
    } catch { /* ignore */ }
  };

  const handleSelect = (rec: RecommendationItem) => {
    if (selectedId === rec.id) { setSelectedId(null); return; }
    setSelectedId(rec.id);
    setDiscoveredKws([]);
    setJobMatches([]);
    setCompanyMatches([]);
    setNotes("");
  };

  const totalC = CANDIDATE_SECTIONS.flatMap((s) => s.items).length;
  const totalB = COMPANY_SECTIONS.flatMap((s) => s.items).length;

  const renderChecklist = (
    sections: typeof CANDIDATE_SECTIONS,
    checked: Record<string, boolean>,
    toggle: (id: string) => void,
  ) =>
    sections.map((section) => (
      <div key={section.section} className="mb-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{section.section}</h3>
        <div className="space-y-3">
          {section.items.map((item) => (
            <label key={item.id} className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={!!checked[item.id]} onChange={() => toggle(item.id)} className="mt-0.5 w-4 h-4 rounded border-gray-300" />
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
        <h1 className="text-2xl font-bold text-gray-900">② 面談・商談中</h1>
        <p className="text-sm text-gray-500 mt-1">聞く:話す = 7:3 ─ キーワードを拾い、リアルタイムで求人マッチング</p>
      </div>

      {/* 推薦案件選択 */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">推薦案件��選択</h2>
        <div className="flex gap-2 overflow-x-auto pb-2">
          {recommendations.map((rec) => (
            <button key={rec.id} onClick={() => handleSelect(rec)}
              className={`flex-shrink-0 rounded-lg border px-4 py-2 text-sm transition-colors ${selectedId === rec.id ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500" : "border-gray-200 bg-white hover:border-gray-300"}`}>
              <span className="font-medium">{rec.candidates.name}</span>
              <span className="text-gray-400 mx-1">→</span>
              <span className="font-medium">{rec.companies.name}</span>
            </button>
          ))}
          {recommendations.length === 0 && <p className="text-sm text-gray-400 py-2">推薦案件がありません</p>}
        </div>
      </div>

      {selected && (
        <>
          {/* キーワード検索 + マッチング */}
          <div className="mb-6 rounded-xl bg-white border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">キーワード発見 → リアルタイムマッチング</h3>
            <p className="text-xs text-gray-400 mb-3">面談中に出てきたキーワードをタップ → 求人・企業をリアルタイム検索</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {KEYWORD_SUGGESTIONS.map((kw) => (
                <button key={kw} onClick={() => toggleKw(kw)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${discoveredKws.includes(kw) ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {kw}
                </button>
              ))}
            </div>

            {(jobMatches.length > 0 || companyMatches.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {jobMatches.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-green-700 mb-2">マッチ求人（{jobMatches.length}件）</h4>
                    <div className="space-y-2 max-h-[250px] overflow-y-auto">
                      {jobMatches.slice(0, 5).map((r) => (
                        <div key={r.job.id} className="rounded-lg border border-green-100 bg-green-50 p-3">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">{r.job.title}</span>
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">スコア {r.match_score}</span>
                          </div>
                          {r.job.companies && <p className="text-xs text-gray-500">{r.job.companies.name}</p>}
                          {(r.job.salary_min || r.job.salary_max) && <p className="text-xs text-gray-500">{r.job.salary_min}〜{r.job.salary_max}万円</p>}
                          <div className="flex flex-wrap gap-1 mt-1">
                            {r.matched_keywords.map((kw) => <span key={kw} className="text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded">{kw}</span>)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {companyMatches.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-orange-700 mb-2">マッチ企業（{companyMatches.length}件）</h4>
                    <div className="space-y-2 max-h-[250px] overflow-y-auto">
                      {companyMatches.slice(0, 5).map((m) => (
                        <div key={m.company.id} className="rounded-lg border border-orange-100 bg-orange-50 p-3">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm">{m.company.name}</span>
                            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">スコア {m.match_score}</span>
                          </div>
                          {m.pitch_summary.length > 0 && (
                            <div className="mt-1 text-xs text-gray-600">{m.pitch_summary.slice(0, 2).map((p, i) => <p key={i}>{p}</p>)}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 面談メモ */}
          <div className="mb-6 rounded-xl bg-white border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-2">面談メモ</h3>
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm min-h-[100px]" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="面談中の気づき、候補者の反応、修正すべき仮説..." />
          </div>

          {/* チェックリスト */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl bg-white border border-gray-200 p-5">
              <h2 className="text-center text-sm font-bold text-gray-700 mb-3 pb-2 border-b">TO 候補者 面談中</h2>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex-1 bg-gray-200 rounded-full h-1.5"><div className="bg-primary-600 h-1.5 rounded-full transition-all" style={{ width: `${(candidateChecklist.checkedCount / totalC) * 100}%` }} /></div>
                <span className="text-xs text-gray-400">{candidateChecklist.checkedCount}/{totalC}</span>
              </div>
              {renderChecklist(CANDIDATE_SECTIONS, candidateChecklist.checked, candidateChecklist.toggle)}
            </div>
            <div className="rounded-xl bg-white border border-gray-200 p-5">
              <h2 className="text-center text-sm font-bold text-gray-700 mb-3 pb-2 border-b">TO 求人企業 商談中</h2>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex-1 bg-gray-200 rounded-full h-1.5"><div className="bg-primary-600 h-1.5 rounded-full transition-all" style={{ width: `${(companyChecklist.checkedCount / totalB) * 100}%` }} /></div>
                <span className="text-xs text-gray-400">{companyChecklist.checkedCount}/{totalB}</span>
              </div>
              {renderChecklist(COMPANY_SECTIONS, companyChecklist.checked, companyChecklist.toggle)}
            </div>
          </div>
        </>
      )}

      <div className="mt-6 rounded-xl bg-amber-50 border border-amber-300 p-4 text-center">
        <p className="text-sm font-medium text-amber-800">
          求人を出すだけでなく「なぜこの求人か」を伝える魅力づけが重要。候補者の課題に対して求人がどう解決するかをセットで提案する
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button onClick={() => navigate("/prep")} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">← 前のフェーズ</button>
        <span className="text-xs text-gray-400">② 面談・商談中 2/4</span>
        <button onClick={() => navigate("/after")} className="px-4 py-2 text-sm font-medium text-primary-700 hover:text-primary-800">次のフェーズ →</button>
      </div>
    </div>
  );
}
