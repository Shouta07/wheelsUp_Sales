import { useState, useEffect } from "react";
import {
  fetchCandidates,
  getCandidate,
  saveMeetingNotes,
  matchCompanies,
  type CandidateItem,
  type MatchedCompany,
} from "../api/client";

const KEYWORD_SUGGESTIONS = [
  "残業少ない", "年収UP", "発注者側", "デベロッパー", "福利厚生充実",
  "リモート可", "土日休み", "転勤なし", "大手", "上場企業",
  "施工管理", "設計", "資格支援", "退職金あり", "マネジメント",
  "現場より管理", "安定", "成長企業", "若手活躍",
];

export default function MeetingAssist() {
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [selected, setSelected] = useState<CandidateItem | null>(null);
  const [notes, setNotes] = useState("");
  const [discoveredKws, setDiscoveredKws] = useState<string[]>([]);
  const [matchResults, setMatchResults] = useState<MatchedCompany[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [matching, setMatching] = useState(false);

  useEffect(() => {
    fetchCandidates("in_progress").then((res) => {
      const all = res.candidates;
      // Show new + in_progress candidates
      fetchCandidates("new").then((res2) => {
        setCandidates([...all, ...res2.candidates]);
      });
    }).catch(console.error);
  }, []);

  const selectCandidate = async (id: string) => {
    try {
      const c = await getCandidate(id);
      setSelected(c);
      setNotes(c.meeting_notes || "");
      setDiscoveredKws([]);
      setMatchResults([]);
      setSaved(false);
      // 既存キーワードで自動マッチ
      if (c.desired_keywords.length > 0) {
        runMatch([...c.desired_keywords]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const toggleKeyword = (kw: string) => {
    setDiscoveredKws((prev) =>
      prev.includes(kw) ? prev.filter((k) => k !== kw) : [...prev, kw],
    );
  };

  const runMatch = async (keywords?: string[]) => {
    const kws = keywords || [
      ...(selected?.desired_keywords || []),
      ...discoveredKws,
    ];
    if (kws.length === 0) return;
    setMatching(true);
    try {
      const res = await matchCompanies(kws);
      setMatchResults(res.results);
    } catch (e) {
      console.error(e);
    } finally {
      setMatching(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await saveMeetingNotes(selected.id, notes, discoveredKws);
      setSelected(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const allKeywords = [
    ...(selected?.desired_keywords || []),
    ...discoveredKws,
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">面談中サポート</h1>
      <p className="text-sm text-gray-500 mb-6">
        候補者の発言からキーワードを拾い、リアルタイムで紹介企業をマッチング
      </p>

      {/* 候補者選択 */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {candidates.map((c) => (
          <button
            key={c.id}
            onClick={() => selectCandidate(c.id)}
            className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
              selected?.id === c.id
                ? "border-primary-500 bg-primary-50 text-primary-700"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
            }`}
          >
            {c.name}
            <span className="ml-1 text-xs text-gray-400">
              {c.current_company}
            </span>
          </button>
        ))}
        {candidates.length === 0 && (
          <p className="text-sm text-gray-400">面談前準備で候補者を登録してください</p>
        )}
      </div>

      {selected && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左: メモ + キーワード */}
          <div className="space-y-4">
            {/* AI推定ニーズ（事前準備結果） */}
            {selected.inferred_needs && Object.keys(selected.inferred_needs).length > 0 && (
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-4">
                <h3 className="text-sm font-semibold text-blue-800 mb-2">AI推定ニーズ（面談前分析）</h3>
                {!!(selected.inferred_needs as Record<string, unknown>).likely_pain_points && (
                  <div className="mb-2">
                    <span className="text-xs text-blue-600 font-medium">推定課題: </span>
                    <span className="text-sm text-blue-900">
                      {((selected.inferred_needs as Record<string, unknown>).likely_pain_points as string[]).join("、")}
                    </span>
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
            <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">面談メモ</h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={10}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder={"候補者の発言をメモ…\n\n例:\n・今の会社は残業が多くて辛い\n・年収は最低500万は欲しい\n・できれば発注者側で働きたい\n・施工管理の資格を活かしたい"}
              />
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={handleSaveNotes}
                  disabled={saving}
                  className="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {saving ? "保存中…" : "メモ保存"}
                </button>
                {saved && <span className="text-sm text-green-600">保存しました</span>}
              </div>
            </div>

            {/* キーワード発見 */}
            <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">
                面談中に発見したキーワード
              </h3>
              <p className="text-xs text-gray-400 mb-3">
                候補者の発言から聞き取れた希望条件をタップ
              </p>
              <div className="flex flex-wrap gap-2 mb-3">
                {KEYWORD_SUGGESTIONS.map((kw) => (
                  <button
                    key={kw}
                    onClick={() => toggleKeyword(kw)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      discoveredKws.includes(kw)
                        ? "bg-green-600 text-white"
                        : allKeywords.includes(kw)
                        ? "bg-primary-100 text-primary-700"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {kw}
                  </button>
                ))}
              </div>
              <button
                onClick={() => runMatch()}
                disabled={allKeywords.length === 0 || matching}
                className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {matching ? "マッチ中…" : "企業を再マッチング"}
              </button>
            </div>
          </div>

          {/* 右: マッチ企業一覧 */}
          <div className="space-y-4">
            <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-1">
                紹介候補企業
              </h3>
              <p className="text-xs text-gray-400 mb-3">
                キーワード: {allKeywords.join(", ") || "未選択"}
              </p>

              {matching && <p className="text-sm text-gray-400 py-4 text-center">マッチング中…</p>}

              {!matching && matchResults.length === 0 && (
                <p className="text-sm text-gray-400 py-4 text-center">
                  キーワードを選択してマッチングを実行してください
                </p>
              )}

              <div className="space-y-3">
                {matchResults.map((m) => (
                  <div key={m.company.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{m.company.name}</div>
                        {m.company.address && (
                          <div className="text-xs text-gray-500">{m.company.address}</div>
                        )}
                      </div>
                      <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-bold text-primary-700">
                        {m.match_score} hit
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {m.matched_keywords.map((kw) => (
                        <span key={kw} className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                          {kw}
                        </span>
                      ))}
                    </div>
                    {m.pitch_summary.length > 0 && (
                      <div className="mt-2 rounded bg-blue-50 p-2">
                        <p className="text-xs font-medium text-blue-700 mb-1">トークポイント:</p>
                        {m.pitch_summary.map((s, i) => (
                          <p key={i} className="text-xs text-blue-800">{s}</p>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 text-xs text-gray-400">
                      案件 {m.company.open_deals_count} 件 / 成約 {m.company.won_deals_count} 件
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
