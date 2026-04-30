import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import {
  fetchCandidates,
  createCandidate,
  generateCandidateBriefing,
  type CandidateItem,
  type CandidateCreateData,
  type CandidateBriefingResponse,
} from "../api/client";

const INDUSTRIES = [
  "総合建設",
  "設備管理",
  "ビルメンテナンス",
  "プロパティマネジメント",
  "デベロッパー",
  "設計事務所",
  "施工管理",
  "インフラ",
  "プラントエンジニアリング",
];

export default function CandidatePrep() {
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<CandidateBriefingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CandidateCreateData>({
    name: "",
    current_company: "",
    current_position: "",
    current_industry: "",
    years_of_experience: undefined,
    current_salary: undefined,
    desired_salary: undefined,
    desired_location: "",
    desired_position: "",
    qualifications: [],
    desired_keywords: [],
  });
  const [qualInput, setQualInput] = useState("");
  const [kwInput, setKwInput] = useState("");

  useEffect(() => {
    loadCandidates();
  }, []);

  const loadCandidates = async () => {
    setLoading(true);
    try {
      const res = await fetchCandidates();
      setCandidates(res.candidates);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.name) return;
    try {
      const c = await createCandidate(form);
      setCandidates((prev) => [c, ...prev]);
      setShowForm(false);
      setForm({ name: "", current_company: "", current_position: "", current_industry: "" });
      setSelectedId(c.id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleBriefing = async (id: string) => {
    setSelectedId(id);
    setBriefingLoading(true);
    setBriefing(null);
    try {
      const res = await generateCandidateBriefing(id);
      setBriefing(res);
    } catch (e) {
      console.error(e);
    } finally {
      setBriefingLoading(false);
    }
  };

  const selected = candidates.find((c) => c.id === selectedId);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">面談前準備</h1>
          <p className="text-sm text-gray-500 mt-1">
            候補者を登録 → AIブリーフィングで万全の準備
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
        >
          {showForm ? "閉じる" : "+ 候補者登録"}
        </button>
      </div>

      {/* 登録フォーム */}
      {showForm && (
        <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-5 mb-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">新規候補者登録</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">名前 *</label>
              <input
                type="text" value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">現職企業</label>
              <input
                type="text" value={form.current_company}
                onChange={(e) => setForm({ ...form, current_company: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">現職ポジション</label>
              <input
                type="text" value={form.current_position}
                onChange={(e) => setForm({ ...form, current_position: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">業界</label>
              <select
                value={form.current_industry}
                onChange={(e) => setForm({ ...form, current_industry: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">選択してください</option>
                {INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">経験年数</label>
              <input
                type="number" value={form.years_of_experience ?? ""}
                onChange={(e) => setForm({ ...form, years_of_experience: e.target.value ? parseInt(e.target.value) : undefined })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">現在年収（万円）</label>
              <input
                type="number" value={form.current_salary ?? ""}
                onChange={(e) => setForm({ ...form, current_salary: e.target.value ? parseInt(e.target.value) : undefined })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">希望年収（万円）</label>
              <input
                type="number" value={form.desired_salary ?? ""}
                onChange={(e) => setForm({ ...form, desired_salary: e.target.value ? parseInt(e.target.value) : undefined })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">希望勤務地</label>
              <input
                type="text" value={form.desired_location}
                onChange={(e) => setForm({ ...form, desired_location: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">保有資格（Enter で追加）</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text" value={qualInput}
                  onChange={(e) => setQualInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && qualInput.trim()) {
                      setForm({ ...form, qualifications: [...(form.qualifications || []), qualInput.trim()] });
                      setQualInput("");
                    }
                  }}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="1級建築施工管理技士"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {(form.qualifications || []).map((q, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">
                    {q}
                    <button onClick={() => setForm({ ...form, qualifications: form.qualifications?.filter((_, j) => j !== i) })}>&times;</button>
                  </span>
                ))}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">希望条件キーワード（Enter で追加）</label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text" value={kwInput}
                  onChange={(e) => setKwInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && kwInput.trim()) {
                      setForm({ ...form, desired_keywords: [...(form.desired_keywords || []), kwInput.trim()] });
                      setKwInput("");
                    }
                  }}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  placeholder="残業少ない, 年収UP, 発注者側"
                />
              </div>
              <div className="flex flex-wrap gap-1">
                {(form.desired_keywords || []).map((kw, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-700">
                    {kw}
                    <button onClick={() => setForm({ ...form, desired_keywords: form.desired_keywords?.filter((_, j) => j !== i) })}>&times;</button>
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={!form.name}
            className="mt-4 rounded-lg bg-primary-600 px-6 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            登録してブリーフィング生成
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 候補者リスト */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">候補者一覧</h2>
          {loading && <p className="text-sm text-gray-400">読み込み中…</p>}
          {candidates.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${
                selectedId === c.id
                  ? "border-primary-500 bg-primary-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <div className="font-medium text-gray-900">{c.name}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {c.current_company || "企業未登録"} / {c.current_position || "ポジション未登録"}
              </div>
              <div className="flex gap-1 mt-1.5">
                <span className={`rounded-full px-2 py-0.5 text-xs ${
                  c.status === "new" ? "bg-blue-100 text-blue-700" :
                  c.status === "in_progress" ? "bg-green-100 text-green-700" :
                  c.status === "placed" ? "bg-purple-100 text-purple-700" :
                  c.status === "lost" ? "bg-red-100 text-red-700" :
                  "bg-gray-100 text-gray-600"
                }`}>
                  {c.status === "new" ? "新規" : c.status === "in_progress" ? "進行中" : c.status === "placed" ? "成約" : c.status === "lost" ? "離脱" : "保留"}
                </span>
                {c.desired_keywords.slice(0, 2).map((kw) => (
                  <span key={kw} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{kw}</span>
                ))}
              </div>
            </button>
          ))}
          {!loading && candidates.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">
              候補者を登録してください
            </p>
          )}
        </div>

        {/* 候補者詳細 + ブリーフィング */}
        <div className="lg:col-span-2 space-y-4">
          {selected ? (
            <>
              {/* プロフィールカード */}
              <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{selected.name}</h2>
                    <p className="text-sm text-gray-500">
                      {selected.current_company} / {selected.current_position}
                    </p>
                  </div>
                  <button
                    onClick={() => handleBriefing(selected.id)}
                    disabled={briefingLoading}
                    className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    {briefingLoading ? "生成中…" : "AIブリーフィング生成"}
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                  <div className="rounded-lg bg-gray-50 p-2.5">
                    <div className="text-xs text-gray-500">経験</div>
                    <div className="text-sm font-medium">{selected.years_of_experience ?? "-"}年</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2.5">
                    <div className="text-xs text-gray-500">現年収</div>
                    <div className="text-sm font-medium">{selected.current_salary ?? "-"}万円</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2.5">
                    <div className="text-xs text-gray-500">希望年収</div>
                    <div className="text-sm font-medium">{selected.desired_salary ?? "-"}万円</div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-2.5">
                    <div className="text-xs text-gray-500">希望地</div>
                    <div className="text-sm font-medium">{selected.desired_location || "-"}</div>
                  </div>
                </div>
                {selected.qualifications.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {selected.qualifications.map((q) => (
                      <span key={q} className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800">{q}</span>
                    ))}
                  </div>
                )}
                {selected.desired_keywords.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {selected.desired_keywords.map((kw) => (
                      <span key={kw} className="rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-700">{kw}</span>
                    ))}
                  </div>
                )}
              </div>

              {/* AIブリーフィング結果 */}
              {briefingLoading && (
                <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-8 text-center">
                  <div className="animate-spin inline-block w-6 h-6 border-2 border-primary-600 border-t-transparent rounded-full mb-3" />
                  <p className="text-sm text-gray-500">AIが面談準備を作成中…</p>
                  <p className="text-xs text-gray-400 mt-1">現職企業分析・ニーズ推定・紹介企業候補を生成しています</p>
                </div>
              )}

              {briefing && briefing.candidate_id === selected.id && (
                <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-5">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">AIブリーフィング</h3>
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown>{briefing.briefing}</ReactMarkdown>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-12 text-center text-gray-400">
              左の候補者リストから選択するか、新規登録してください
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
