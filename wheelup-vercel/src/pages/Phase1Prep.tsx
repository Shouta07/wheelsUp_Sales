import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { fetchCandidates, fetchCompanies, type CandidateItem, type CompanyItem } from "../api/client";
import { usePhaseChecklist } from "../hooks/usePhaseProgress";

interface CheckItem {
  id: string;
  label: string;
  hint?: string;
  tag: "必須" | "推奨" | "差別化";
}

const CANDIDATE_ITEMS: { section: string; items: CheckItem[] }[] = [
  {
    section: "候補者情報の把握",
    items: [
      { id: "c1", label: "Pipedrive で登録情報・前回接触メモを確認", hint: "「初回か継続か」で温度感が変わる", tag: "必須" },
      { id: "c2", label: "転職動機カテゴリの仮説を立てる", hint: "年収・環境・キャリア・ライフイベントのどれか", tag: "必須" },
      { id: "c3", label: "保有資格・現職・年収・希望地域を確認", tag: "必須" },
    ],
  },
  {
    section: "面談設計",
    items: [
      { id: "c4", label: "マッチしそうな求人を2〜3件ピックアップ", hint: "面談中に「こういう求人があります」と示せると信頼UP", tag: "推奨" },
      { id: "c5", label: "「この面談で決めること」を1行で書く", hint: "例：希望条件の優先順位と応募意欲を確認する", tag: "必須" },
    ],
  },
];

const COMPANY_ITEMS: { section: string; items: CheckItem[] }[] = [
  {
    section: "企業情報の把握",
    items: [
      { id: "b1", label: "Pipedrive で過去接触・料率・業種を確認", tag: "必須" },
      { id: "b2", label: "採用背景の仮説を3つ立てる", hint: "欠員・拡大・DX・高齢化対応のどれか", tag: "必須" },
      { id: "b3", label: "企業サイト・採用ページを5分で確認", tag: "推奨" },
    ],
  },
  {
    section: "商談設計",
    items: [
      { id: "b4", label: "提示できる候補者スペック（匿名）を1件準備", hint: "「今こういう方がいます」で商談を具体化させる", tag: "差別化" },
      { id: "b5", label: "アジェンダを24時間前に送付", hint: "ドタキャン率が下がる。主導権を握る", tag: "差別化" },
    ],
  },
];

const TAG_COLORS: Record<string, string> = {
  "必須": "bg-red-100 text-red-700",
  "推奨": "bg-orange-100 text-orange-700",
  "差別化": "bg-blue-100 text-blue-700",
};

function EntitySelector<T extends { id: string; name: string }>({
  items,
  selectedId,
  onSelect,
  placeholder,
}: {
  items: T[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  placeholder: string;
}) {
  return (
    <select
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
      value={selectedId || ""}
      onChange={(e) => onSelect(e.target.value || null)}
    >
      <option value="">{placeholder}</option>
      {items.map((item) => (
        <option key={item.id} value={item.id}>{item.name}</option>
      ))}
    </select>
  );
}

export default function Phase1Prep() {
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

  const candidateChecklist = usePhaseChecklist("candidate", candidateId, 1);
  const companyChecklist = usePhaseChecklist("company", companyId, 1);

  const totalCandidate = CANDIDATE_ITEMS.flatMap((s) => s.items).length;
  const totalCompany = COMPANY_ITEMS.flatMap((s) => s.items).length;

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
        <h1 className="text-2xl font-bold text-gray-900">① 前準備</h1>
        <p className="text-sm text-gray-500 mt-1">24時間前までに完了 ─ 両面の情報を揃えて望む</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 候補者側 */}
        <div className="rounded-xl bg-white border border-gray-200 p-5">
          <h2 className="text-center text-sm font-bold text-gray-700 mb-3 pb-2 border-b">TO 候補者 面談前</h2>
          <div className="mb-4">
            <EntitySelector items={candidates} selectedId={candidateId} onSelect={setCandidateId} placeholder="候補者を選択..." />
          </div>
          {selectedCandidate && (
            <div className="mb-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-600 space-y-1">
              <div className="flex justify-between"><span>現職: {selectedCandidate.current_position || "未設定"}</span><span>年収: {selectedCandidate.current_salary ? `${selectedCandidate.current_salary}万` : "未設定"}</span></div>
              <div className="flex justify-between"><span>資格: {selectedCandidate.qualifications?.join(", ") || "未設定"}</span><span>希望地: {selectedCandidate.desired_location || "未設定"}</span></div>
            </div>
          )}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 bg-gray-200 rounded-full h-1.5">
              <div className="bg-primary-600 h-1.5 rounded-full transition-all" style={{ width: `${totalCandidate > 0 ? (candidateChecklist.checkedCount / totalCandidate) * 100 : 0}%` }} />
            </div>
            <span className="text-xs text-gray-400">{candidateChecklist.checkedCount}/{totalCandidate}</span>
          </div>
          {renderChecklist(CANDIDATE_ITEMS, candidateChecklist.checked, candidateChecklist.toggle, !candidateId)}
        </div>

        {/* 企業側 */}
        <div className="rounded-xl bg-white border border-gray-200 p-5">
          <h2 className="text-center text-sm font-bold text-gray-700 mb-3 pb-2 border-b">TO 求人企業 商談前</h2>
          <div className="mb-4">
            <EntitySelector items={companies} selectedId={companyId} onSelect={setCompanyId} placeholder="企業を選択..." />
          </div>
          {selectedCompany && (
            <div className="mb-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-600 space-y-1">
              <div className="flex justify-between"><span>業種: {selectedCompany.industry || "未設定"}</span><span>所在地: {selectedCompany.address || "未設定"}</span></div>
              <div>キーワード: {selectedCompany.keywords?.join(", ") || "未設定"}</div>
            </div>
          )}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 bg-gray-200 rounded-full h-1.5">
              <div className="bg-primary-600 h-1.5 rounded-full transition-all" style={{ width: `${totalCompany > 0 ? (companyChecklist.checkedCount / totalCompany) * 100 : 0}%` }} />
            </div>
            <span className="text-xs text-gray-400">{companyChecklist.checkedCount}/{totalCompany}</span>
          </div>
          {renderChecklist(COMPANY_ITEMS, companyChecklist.checked, companyChecklist.toggle, !companyId)}
        </div>
      </div>

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
