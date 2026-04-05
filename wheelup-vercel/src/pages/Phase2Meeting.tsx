import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface CheckItem {
  id: string;
  label: string;
  hint?: string;
  tag: "最重要" | "必須" | "確認";
}

const CANDIDATE_SECTIONS: { section: string; items: CheckItem[] }[] = [
  {
    section: "転職動機の深掘り（最重要）",
    items: [
      { id: "cq1", label: "Q1: 今の転職を考えたきっかけは？", hint: "表面的な答えの奥を「具体的には？」で2回掘る", tag: "最重要" },
      { id: "cq2", label: "Q2: 今の会社の不満 vs 次の会社への希望", hint: "「不満」は動機、「希望」は条件整理に使う", tag: "最重要" },
      { id: "cq3", label: "Q3: 転職の優先順位（年収/環境/仕事内容/場所）", hint: "どれが外せないかで推薦先が絞れる", tag: "必須" },
    ],
  },
  {
    section: "条件確認",
    items: [
      { id: "cq4", label: "Q4: 希望年収（下限・理想）と現年収", tag: "必須" },
      { id: "cq5", label: "Q5: 勤務地・リモート希望と転職時期", tag: "必須" },
      { id: "cq6", label: "Q6: 絶対NGな会社・条件（地雷確認）", hint: "ここを押さえないとミスマッチ紹介になる", tag: "必須" },
    ],
  },
  {
    section: "クロージング",
    items: [
      { id: "cq7", label: "Q7: 他社エージェント利用状況", hint: "並走なら「弊社独自案件」を強調する", tag: "確認" },
      { id: "cq8", label: "「3日以内に求人を送ります」と期日を宣言", hint: "これが言えるかどうかが面談の質を決める", tag: "必須" },
    ],
  },
];

const COMPANY_SECTIONS: { section: string; items: CheckItem[] }[] = [
  {
    section: "採用ニーズの深掘り（最重要）",
    items: [
      { id: "bq1", label: "Q1: 採用背景（欠員・拡大・DX・高齢化）", tag: "最重要" },
      { id: "bq2", label: "Q2: 現社員の構成（年齢・資格保有状況）", hint: "高齢化・若手不足の深刻度がここでわかる", tag: "最重要" },
      { id: "bq3", label: "Q3: 担当業務・案件規模・資格要件", tag: "必須" },
    ],
  },
  {
    section: "条件確認",
    items: [
      { id: "bq4", label: "Q4: 年収レンジ（下限・上限）と残業実態", hint: "ここを聞かないと候補者に嘘をつくことになる", tag: "最重要" },
      { id: "bq5", label: "Q5: 採用フロー・面接回数・意思決定者", tag: "必須" },
      { id: "bq6", label: "Q6: 採用期限と他社エージェント並走状況", tag: "確認" },
    ],
  },
  {
    section: "クロージング",
    items: [
      { id: "bq7", label: "料率・支払条件・保証期間を口頭合意", tag: "必須" },
      { id: "bq8", label: "「○日までに候補者を送ります」と期日宣言", tag: "最重要" },
    ],
  },
];

const TAG_COLORS: Record<string, string> = {
  "最重要": "bg-red-100 text-red-700",
  "必須": "bg-orange-100 text-orange-700",
  "確認": "bg-gray-100 text-gray-600",
};

export default function Phase2Meeting() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  const allItems = [...CANDIDATE_SECTIONS, ...COMPANY_SECTIONS].flatMap((s) => s.items);
  const checkedCount = Object.values(checked).filter(Boolean).length;

  const renderSection = (sections: { section: string; items: CheckItem[] }[]) =>
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
        <h1 className="text-2xl font-bold text-gray-900">② 面談・商談中</h1>
        <p className="text-sm text-gray-500 mt-1">聞く:話す = 7:3。両面ともヒアリングが主役</p>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex-1 bg-gray-200 rounded-full h-2">
            <div className="bg-primary-600 h-2 rounded-full transition-all" style={{ width: `${allItems.length > 0 ? (checkedCount / allItems.length) * 100 : 0}%` }} />
          </div>
          <span className="text-xs text-gray-500">{checkedCount}/{allItems.length}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl bg-white border border-gray-200 p-5">
          <h2 className="text-center text-sm font-bold text-gray-700 mb-4 pb-2 border-b">TO 候補者 面談中</h2>
          {renderSection(CANDIDATE_SECTIONS)}
        </div>

        <div className="rounded-xl bg-white border border-gray-200 p-5">
          <h2 className="text-center text-sm font-bold text-gray-700 mb-4 pb-2 border-b">TO 求人企業 商談中</h2>
          {renderSection(COMPANY_SECTIONS)}
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-amber-50 border border-amber-300 p-4 text-center">
        <p className="text-sm font-medium text-amber-800">
          両面の情報を突合 ─ 候補者の年収下限 vs 企業の上限が合うか。候補者のNG条件 vs 企業の実態に矛盾がないか。これがミスマッチを防ぐ最重要ポイント
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button onClick={() => navigate("/")} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">← 前のフェーズ</button>
        <span className="text-xs text-gray-400">② 面談・商談中 2/4</span>
        <button onClick={() => navigate("/after")} className="px-4 py-2 text-sm font-medium text-primary-700 hover:text-primary-800">次のフェーズ →</button>
      </div>
    </div>
  );
}
