import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchCandidates, fetchCompanies } from "../api/client";
import { usePhaseChecklist } from "../hooks/usePhaseProgress";

interface CheckItem {
  id: string;
  label: string;
  hint?: string;
  tag: "30分以内" | "当日中" | "3日以内";
}

const CANDIDATE_SECTIONS: { section: string; items: CheckItem[] }[] = [
  {
    section: "30分以内",
    items: [
      { id: "ca1", label: "Pipedrive にヒアリング結果を記録", hint: "温度感・希望条件・優先順位を構造化して入力", tag: "30分以内" },
      { id: "ca2", label: "Lark に議事録を格納（Gemini文字起こし or 手動）", hint: "音声アップロード → 自動要約が最速", tag: "30分以内" },
      { id: "ca3", label: "求人マッチング開始（キーワード×条件）", hint: "面談中に発見したキーワードでマッチング実行", tag: "30分以内" },
    ],
  },
  {
    section: "当日中",
    items: [
      { id: "ca4", label: "お礼メール + 期日宣言（3日以内に求人送付）", hint: "「本日はありがとうございました。○日までに求人情報をお送りします」", tag: "当日中" },
    ],
  },
  {
    section: "3日以内",
    items: [
      { id: "ca5", label: "マッチ求人を3件以上送付", hint: "「なぜこの求人を薦めるか」を1行添える", tag: "3日以内" },
      { id: "ca6", label: "Pipedrive リマインダー設定（次回フォロー日）", hint: "フォロー漏れ防止。7日以上空くとアラート対象", tag: "3日以内" },
    ],
  },
];

const COMPANY_SECTIONS: { section: string; items: CheckItem[] }[] = [
  {
    section: "30分以内",
    items: [
      { id: "co1", label: "Pipedrive ステージを更新", hint: "商談→提案中/候補者紹介待ち等に遷移", tag: "30分以内" },
      { id: "co2", label: "Lark に議事録を格納", hint: "合意事項・料率・採用要件を記録", tag: "30分以内" },
      { id: "co3", label: "フィー試算（年収レンジ × 料率）", hint: "成約時のフィー見込みを把握しておく", tag: "30分以内" },
    ],
  },
  {
    section: "当日中",
    items: [
      { id: "co4", label: "お礼メール + 合意サマリ送付", hint: "「本日の合意事項をまとめました」で認識齟齬を防ぐ", tag: "当日中" },
    ],
  },
  {
    section: "3日以内",
    items: [
      { id: "co5", label: "候補者推薦文を送付", hint: "要件×強みを軸にした推薦文。「なぜこの人か」を明記", tag: "3日以内" },
      { id: "co6", label: "Pipedrive フォロー設定", hint: "書類選考催促は5日後、面接設定は3日以内が目安", tag: "3日以内" },
    ],
  },
];

const TAG_COLORS: Record<string, string> = {
  "30分以内": "bg-red-100 text-red-700",
  "当日中": "bg-orange-100 text-orange-700",
  "3日以内": "bg-blue-100 text-blue-700",
};

export default function Phase3After() {
  const navigate = useNavigate();
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const { data: candidatesData } = useQuery({
    queryKey: ["candidates-all"],
    queryFn: () => fetchCandidates(),
  });
  const { data: companiesData } = useQuery({
    queryKey: ["companies-all"],
    queryFn: () => fetchCompanies(),
  });

  const candidates = candidatesData?.candidates || [];
  const companies = companiesData?.companies || [];
  const selectedCandidate = candidates.find((c) => c.id === candidateId);
  const selectedCompany = companies.find((c) => c.id === companyId);

  const candidateChecklist = usePhaseChecklist("candidate", candidateId, 3);
  const companyChecklist = usePhaseChecklist("company", companyId, 3);

  const totalCandidate = CANDIDATE_SECTIONS.flatMap((s) => s.items).length;
  const totalCompany = COMPANY_SECTIONS.flatMap((s) => s.items).length;

  const renderChecklist = (
    sections: { section: string; items: CheckItem[] }[],
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
                {item.hint && <p className="text-xs text-gray-400 mt-0.5">{item.hint}</p>}
              </div>
            </label>
          ))}
        </div>
      </div>
    ));

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">③ 直後対応</h1>
        <p className="text-sm text-gray-500 mt-1">30分ルール ─ 面談・商談直後の対応速度が成約率を決める</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl bg-white border border-gray-200 p-5">
          <h2 className="text-center text-sm font-bold text-gray-700 mb-3 pb-2 border-b">TO 候補者 面談後</h2>
          <div className="mb-4">
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={candidateId || ""} onChange={(e) => setCandidateId(e.target.value || null)}>
              <option value="">候補者を選択...</option>
              {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {selectedCandidate && (
            <div className="mb-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
              {selectedCandidate.name} | {selectedCandidate.current_position || "未設定"} | ステータス: {selectedCandidate.status}
            </div>
          )}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 bg-gray-200 rounded-full h-1.5">
              <div className="bg-primary-600 h-1.5 rounded-full transition-all" style={{ width: `${totalCandidate > 0 ? (candidateChecklist.checkedCount / totalCandidate) * 100 : 0}%` }} />
            </div>
            <span className="text-xs text-gray-400">{candidateChecklist.checkedCount}/{totalCandidate}</span>
          </div>
          {renderChecklist(CANDIDATE_SECTIONS, candidateChecklist.checked, candidateChecklist.toggle, !candidateId)}
        </div>

        <div className="rounded-xl bg-white border border-gray-200 p-5">
          <h2 className="text-center text-sm font-bold text-gray-700 mb-3 pb-2 border-b">TO 求人企業 商談後</h2>
          <div className="mb-4">
            <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white" value={companyId || ""} onChange={(e) => setCompanyId(e.target.value || null)}>
              <option value="">企業を選択...</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {selectedCompany && (
            <div className="mb-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
              {selectedCompany.name} | {selectedCompany.industry || "未設定"} | {selectedCompany.address || "未設定"}
            </div>
          )}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 bg-gray-200 rounded-full h-1.5">
              <div className="bg-primary-600 h-1.5 rounded-full transition-all" style={{ width: `${totalCompany > 0 ? (companyChecklist.checkedCount / totalCompany) * 100 : 0}%` }} />
            </div>
            <span className="text-xs text-gray-400">{companyChecklist.checkedCount}/{totalCompany}</span>
          </div>
          {renderChecklist(COMPANY_SECTIONS, companyChecklist.checked, companyChecklist.toggle, !companyId)}
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-amber-50 border border-amber-300 p-4 text-center">
        <p className="text-sm font-medium text-amber-800">
          スピードが信頼 ─ 「30分以内」のタスクを先にすべて終わらせる。後回しにすると候補者・企業の温度が下がる
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button onClick={() => navigate("/meeting")} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">← 前のフェーズ</button>
        <span className="text-xs text-gray-400">③ 直後対応 3/4</span>
        <button onClick={() => navigate("/closing")} className="px-4 py-2 text-sm font-medium text-primary-700 hover:text-primary-800">次のフェーズ →</button>
      </div>
    </div>
  );
}
