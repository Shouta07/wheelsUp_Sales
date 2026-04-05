import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface CheckItem {
  id: string;
  label: string;
  hint?: string;
  tag: "推薦時" | "面接前後" | "内定〜入社" | "推薦文" | "面接調整" | "内定〜フィー";
}

const CANDIDATE_SECTIONS: { section: string; items: CheckItem[] }[] = [
  {
    section: "推薦時",
    items: [
      { id: "cc1", label: "企業情報を口頭で説明（社風・案件・評価制度）", hint: "「この会社を薦める理由」を自分の言葉で伝える", tag: "推薦時" },
      { id: "cc2", label: "応募意思を明確に確認（温度感を数値化）", hint: "10段階で聞く。7以下なら懸念を深掘り", tag: "推薦時" },
    ],
  },
  {
    section: "面接前後",
    items: [
      { id: "cc3", label: "志望理由の整理サポート", hint: "「なぜこの会社か」を候補者自身の言葉で語れるように", tag: "面接前後" },
      { id: "cc4", label: "面接後フィードバックを当日取得", hint: "「どうでしたか？」ではなく「何が気になりましたか？」で聞く", tag: "面接前後" },
      { id: "cc5", label: "意欲確認（志望度の変化をトラッキング）", hint: "面接ごとに10段階で記録。下がった場合は即対応", tag: "面接前後" },
    ],
  },
  {
    section: "内定〜入社",
    items: [
      { id: "cc6", label: "内定後48時間以内に承諾意思を確認", hint: "「迷っている」は危険信号。懸念を全て出し切る", tag: "内定〜入社" },
      { id: "cc7", label: "退職交渉フォロー", hint: "カウンターオファー対策。「残る理由」vs「転職する理由」を整理", tag: "内定〜入社" },
      { id: "cc8", label: "入社1週間前に確認コール", hint: "入社辞退は最後まで起こり得る。安心感を与える", tag: "内定〜入社" },
    ],
  },
];

const COMPANY_SECTIONS: { section: string; items: CheckItem[] }[] = [
  {
    section: "推薦文の質",
    items: [
      { id: "bc1", label: "要件×強みで推薦文を書く", hint: "「御社の○○要件に対し、この方は○○の経験があり…」", tag: "推薦文" },
      { id: "bc2", label: "NG理由（見送りリスク）も正直に記載", hint: "先に弱点を開示すると信頼度UP。隠すと後でトラブル", tag: "推薦文" },
    ],
  },
  {
    section: "面接調整",
    items: [
      { id: "bc3", label: "書類選考催促（提出から5日以内）", hint: "「候補者が他社選考も進めているため早めの回答を」", tag: "面接調整" },
      { id: "bc4", label: "面接日程を3日以内に設定", hint: "リードタイム短縮が決定率を直接上げる", tag: "面接調整" },
      { id: "bc5", label: "面接翌日にフィードバック取得", hint: "「合否」だけでなく「評価ポイント」を聞く", tag: "面接調整" },
    ],
  },
  {
    section: "内定〜フィー回収",
    items: [
      { id: "bc6", label: "オファー条件を書面で確認", hint: "口頭合意だけでは危険。年収・入社日・配属先を書面化", tag: "内定〜フィー" },
      { id: "bc7", label: "フィー請求タイミングを確認", hint: "入社日基準 or 内定承諾日基準を事前合意", tag: "内定〜フィー" },
      { id: "bc8", label: "入社1ヶ月後に定着確認コール", hint: "早期退職時の保証期間対応。問題あれば即フォロー", tag: "内定〜フィー" },
    ],
  },
];

const TAG_COLORS: Record<string, string> = {
  "推薦時": "bg-blue-100 text-blue-700",
  "面接前後": "bg-orange-100 text-orange-700",
  "内定〜入社": "bg-green-100 text-green-700",
  "推薦文": "bg-purple-100 text-purple-700",
  "面接調整": "bg-orange-100 text-orange-700",
  "内定〜フィー": "bg-green-100 text-green-700",
};

export default function Phase4Closing() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => setChecked((prev) => ({ ...prev, [id]: !prev[id] }));

  const allItems = [...CANDIDATE_SECTIONS, ...COMPANY_SECTIONS].flatMap((s) => s.items);
  const checkedCount = Object.values(checked).filter(Boolean).length;

  const renderSection = (sections: typeof CANDIDATE_SECTIONS) =>
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
        <h1 className="text-2xl font-bold text-gray-900">④ 推薦〜クロージング</h1>
        <p className="text-sm text-gray-500 mt-1">リードタイム短縮 × 決定率最大化 ─ 両面の温度を同時に管理する</p>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex-1 bg-gray-200 rounded-full h-2">
            <div className="bg-primary-600 h-2 rounded-full transition-all" style={{ width: `${allItems.length > 0 ? (checkedCount / allItems.length) * 100 : 0}%` }} />
          </div>
          <span className="text-xs text-gray-500">{checkedCount}/{allItems.length}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl bg-white border border-gray-200 p-5">
          <h2 className="text-center text-sm font-bold text-gray-700 mb-4 pb-2 border-b">TO 候補者 推薦〜入社</h2>
          {renderSection(CANDIDATE_SECTIONS)}
        </div>

        <div className="rounded-xl bg-white border border-gray-200 p-5">
          <h2 className="text-center text-sm font-bold text-gray-700 mb-4 pb-2 border-b">TO 求人企業 推薦〜フィー回収</h2>
          {renderSection(COMPANY_SECTIONS)}
        </div>
      </div>

      <div className="mt-6 rounded-xl bg-amber-50 border border-amber-300 p-4 text-center">
        <p className="text-sm font-medium text-amber-800">
          クロージングの鉄則 ─ 候補者の承諾意思と企業のオファー条件を「同時に」確認する。片方だけ進めるとミスマッチが起こる
        </p>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button onClick={() => navigate("/after")} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700">← 前のフェーズ</button>
        <span className="text-xs text-gray-400">④ 推薦〜クロージング 4/4</span>
        <div />
      </div>
    </div>
  );
}
