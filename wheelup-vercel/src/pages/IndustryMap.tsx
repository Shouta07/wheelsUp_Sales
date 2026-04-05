import { useState, useEffect } from "react";
import {
  fetchTaxonomy,
  fetchCategory,
  fetchQualifications,
  seedKnowledgeData,
  type KnowledgeCategory,
  type QualificationItem,
} from "../api/client";

const TREND_COLORS: Record<string, string> = {
  "急拡大": "bg-green-100 text-green-800",
  "拡大": "bg-green-50 text-green-700",
  "安定": "bg-blue-50 text-blue-700",
  "安定〜拡大": "bg-blue-50 text-blue-700",
  "縮小": "bg-red-50 text-red-700",
};

const FIELD_COLORS: Record<string, string> = {
  "建築": "bg-orange-100 text-orange-700",
  "土木": "bg-emerald-100 text-emerald-700",
  "設備": "bg-blue-100 text-blue-700",
  "共通": "bg-gray-100 text-gray-700",
};

const DIFFICULTY_COLORS: Record<string, string> = {
  "高": "bg-red-100 text-red-700",
  "中〜高": "bg-orange-100 text-orange-700",
  "中": "bg-yellow-100 text-yellow-700",
  "低": "bg-green-100 text-green-700",
};

export default function IndustryMap() {
  const [allCategories, setAllCategories] = useState<KnowledgeCategory[]>([]);
  const [qualifications, setQualifications] = useState<QualificationItem[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<KnowledgeCategory | null>(null);
  const [selectedQual, setSelectedQual] = useState<QualificationItem | null>(null);
  const [tab, setTab] = useState<"map" | "quals">("map");
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState("");
  const [qualField, setQualField] = useState<string>("");

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadQualifications();
  }, [qualField]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchTaxonomy();
      setAllCategories(res.categories);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadQualifications = async () => {
    try {
      const res = await fetchQualifications(qualField || undefined);
      setQualifications(res.qualifications);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    setSeedMsg("");
    try {
      const res = await seedKnowledgeData();
      setSeedMsg(
        res.status === "skipped"
          ? "データは既に投入済みです"
          : `${res.categories} カテゴリ + ${res.qualifications} 資格を投入しました`,
      );
      await loadData();
      await loadQualifications();
    } catch (e) {
      setSeedMsg("データ投入に失敗しました");
      console.error(e);
    } finally {
      setSeeding(false);
    }
  };

  const selectCategory = async (slug: string) => {
    setSelectedSlug(slug);
    setSelectedQual(null);
    try {
      const detail = await fetchCategory(slug);
      setSelectedDetail(detail);
    } catch (e) {
      console.error(e);
    }
  };

  const majors = allCategories.filter((c) => c.level === 0);
  const getChildren = (parentId: string) =>
    allCategories.filter((c) => c.parent_id === parentId);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">業界ナレッジ</h1>
          <p className="text-sm text-gray-500 mt-1">
            建設業界の構造・職種・資格を体系的に学ぶ（SEO基盤）
          </p>
        </div>
        <button
          onClick={handleSeed}
          disabled={seeding}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {seeding ? "投入中…" : "初期データ投入"}
        </button>
      </div>

      {seedMsg && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800 mb-4">
          {seedMsg}
        </div>
      )}

      {/* タブ切替 */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setTab("map"); setSelectedQual(null); }}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            tab === "map" ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600"
          }`}
        >
          業界マップ
        </button>
        <button
          onClick={() => { setTab("quals"); setSelectedDetail(null); setSelectedSlug(null); }}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            tab === "quals" ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600"
          }`}
        >
          資格ガイド
        </button>
      </div>

      {loading && <p className="text-sm text-gray-400 py-4">読み込み中…</p>}

      {/* ===== 業界マップ ===== */}
      {tab === "map" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左: ツリーナビゲーション */}
          <div className="space-y-4">
            {majors.map((major) => (
              <div key={major.id} className="rounded-xl bg-white shadow-sm border border-gray-200 p-4">
                <button
                  onClick={() => selectCategory(major.slug)}
                  className={`w-full text-left font-bold text-lg mb-2 transition-colors ${
                    selectedSlug === major.slug ? "text-primary-700" : "text-gray-900 hover:text-primary-600"
                  }`}
                >
                  {major.name}
                  {major.growth_trend && (
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${
                      TREND_COLORS[major.growth_trend] || "bg-gray-100"
                    }`}>
                      {major.growth_trend}
                    </span>
                  )}
                </button>
                {major.description && (
                  <p className="text-xs text-gray-500 mb-3">{major.description}</p>
                )}
                <div className="space-y-1">
                  {getChildren(major.id).map((child) => (
                    <button
                      key={child.id}
                      onClick={() => selectCategory(child.slug)}
                      className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors ${
                        selectedSlug === child.slug
                          ? "bg-primary-50 text-primary-700 border border-primary-200"
                          : "hover:bg-gray-50 text-gray-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{child.name}</span>
                        {child.growth_trend && (
                          <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                            TREND_COLORS[child.growth_trend] || "bg-gray-100"
                          }`}>
                            {child.growth_trend}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            {majors.length === 0 && !loading && (
              <div className="text-center py-8 text-gray-400">
                「初期データ投入」ボタンでデータを投入してください
              </div>
            )}
          </div>

          {/* 右: 詳細パネル */}
          <div className="lg:col-span-2">
            {selectedDetail ? (
              <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-6 space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedDetail.name}</h2>
                  {selectedDetail.growth_trend && (
                    <span className={`inline-block mt-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      TREND_COLORS[selectedDetail.growth_trend] || "bg-gray-100"
                    }`}>
                      トレンド: {selectedDetail.growth_trend}
                    </span>
                  )}
                </div>

                {selectedDetail.market_overview && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-1">市場概要</h3>
                    <p className="text-sm text-gray-600">{selectedDetail.market_overview}</p>
                  </div>
                )}

                {selectedDetail.salary_range && (
                  <div className="rounded-lg bg-yellow-50 p-3">
                    <span className="text-xs font-semibold text-yellow-700">年収帯: </span>
                    <span className="text-sm text-yellow-900">{selectedDetail.salary_range}</span>
                  </div>
                )}

                {selectedDetail.typical_roles.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">代表的な職種</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedDetail.typical_roles.map((r) => (
                        <span key={r} className="rounded-full bg-primary-100 px-2.5 py-0.5 text-xs text-primary-700">{r}</span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedDetail.required_qualifications.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">関連資格</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedDetail.required_qualifications.map((q) => (
                        <span key={q} className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs text-yellow-800">{q}</span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedDetail.selling_points.length > 0 && (
                  <div className="rounded-lg bg-green-50 p-4">
                    <h3 className="text-sm font-semibold text-green-800 mb-2">候補者への訴求ポイント</h3>
                    <ul className="space-y-1">
                      {selectedDetail.selling_points.map((sp, i) => (
                        <li key={i} className="text-sm text-green-700 flex items-start gap-1.5">
                          <span className="mt-0.5 text-green-500">+</span> {sp}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedDetail.pain_points.length > 0 && (
                  <div className="rounded-lg bg-red-50 p-4">
                    <h3 className="text-sm font-semibold text-red-800 mb-2">この領域で働く人の典型的な不満</h3>
                    <ul className="space-y-1">
                      {selectedDetail.pain_points.map((pp, i) => (
                        <li key={i} className="text-sm text-red-700 flex items-start gap-1.5">
                          <span className="mt-0.5 text-red-500">-</span> {pp}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedDetail.talking_tips && (
                  <div className="rounded-lg bg-blue-50 p-4">
                    <h3 className="text-sm font-semibold text-blue-800 mb-2">面談で使えるトーク Tips</h3>
                    <p className="text-sm text-blue-700">{selectedDetail.talking_tips}</p>
                  </div>
                )}

                {selectedDetail.key_players.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-2">主要企業</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedDetail.key_players.map((kp) => (
                        <span key={kp} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">{kp}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-12 text-center text-gray-400">
                左のカテゴリを選択すると詳細が表示されます
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== 資格ガイド ===== */}
      {tab === "quals" && (
        <div>
          <div className="flex gap-2 mb-4">
            {["", "建築", "土木", "設備", "共通"].map((f) => (
              <button
                key={f}
                onClick={() => setQualField(f)}
                className={`rounded-full px-3 py-1 text-sm font-medium ${
                  qualField === f ? "bg-primary-600 text-white" : "bg-gray-100 text-gray-600"
                }`}
              >
                {f || "全て"}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {qualifications.map((q) => (
              <button
                key={q.id}
                onClick={() => setSelectedQual(selectedQual?.id === q.id ? null : q)}
                className={`w-full text-left rounded-xl bg-white shadow-sm border p-4 transition-colors ${
                  selectedQual?.id === q.id ? "border-primary-500" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-bold text-gray-900">{q.name}</h3>
                  <div className="flex gap-1">
                    {q.field && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${FIELD_COLORS[q.field] || "bg-gray-100"}`}>
                        {q.field}
                      </span>
                    )}
                    {q.difficulty && (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${DIFFICULTY_COLORS[q.difficulty] || "bg-gray-100"}`}>
                        難易度: {q.difficulty}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-xs text-gray-500 mb-2">{q.description}</p>

                {selectedQual?.id === q.id && (
                  <div className="mt-3 space-y-3 border-t pt-3">
                    {q.market_value && (
                      <div>
                        <span className="text-xs font-semibold text-gray-600">転職市場での価値: </span>
                        <span className="text-sm text-gray-700">{q.market_value}</span>
                      </div>
                    )}
                    {q.salary_impact && (
                      <div className="rounded bg-yellow-50 p-2">
                        <span className="text-xs font-semibold text-yellow-700">年収インパクト: </span>
                        <span className="text-sm text-yellow-900">{q.salary_impact}</span>
                      </div>
                    )}
                    {q.related_roles.length > 0 && (
                      <div>
                        <span className="text-xs font-semibold text-gray-600">活かせる職種: </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {q.related_roles.map((r) => (
                            <span key={r} className="rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-700">{r}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {q.tips_for_consultant && (
                      <div className="rounded bg-blue-50 p-2">
                        <span className="text-xs font-semibold text-blue-700">コンサルタント向けTips: </span>
                        <span className="text-sm text-blue-800">{q.tips_for_consultant}</span>
                      </div>
                    )}
                  </div>
                )}
              </button>
            ))}
          </div>

          {qualifications.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              データがありません。「初期データ投入」を実行してください。
            </div>
          )}
        </div>
      )}
    </div>
  );
}
