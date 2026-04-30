import { useState, useCallback } from "react";
import {
  fetchCompanies,
  matchCompanies,
  updateCompanyKeywords,
  syncCompaniesFromPipedrive,
  type CompanyItem,
  type MatchedCompany,
} from "../api/client";

/* ---------- 定番キーワードチップ ---------- */
const SUGGESTED_KEYWORDS = [
  "残業少ない",
  "年収UP",
  "発注者側",
  "デベロッパー",
  "福利厚生充実",
  "リモート可",
  "土日休み",
  "転勤なし",
  "大手",
  "上場企業",
  "施工管理",
  "設計",
  "資格支援",
  "退職金あり",
];

export default function Companies() {
  /* --- State --- */
  const [companies, setCompanies] = useState<CompanyItem[]>([]);
  const [matchResults, setMatchResults] = useState<MatchedCompany[]>([]);
  const [searchName, setSearchName] = useState("");
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [customKw, setCustomKw] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  const [mode, setMode] = useState<"list" | "match">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editKws, setEditKws] = useState("");
  const [editPitch, setEditPitch] = useState("");

  /* --- 企業一覧取得 --- */
  const loadCompanies = useCallback(async () => {
    setLoading(true);
    setMode("list");
    setMatchResults([]);
    try {
      const res = await fetchCompanies(searchName || undefined);
      setCompanies(res.companies);
    } catch (e: unknown) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [searchName]);

  /* --- Pipedrive 同期 --- */
  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg("");
    try {
      const res = await syncCompaniesFromPipedrive();
      setSyncMsg(res.message);
      await loadCompanies();
    } catch (e: unknown) {
      setSyncMsg("同期に失敗しました");
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  /* --- キーワードマッチ --- */
  const handleMatch = async () => {
    if (selectedKeywords.length === 0) return;
    setLoading(true);
    setMode("match");
    try {
      const res = await matchCompanies(selectedKeywords);
      setMatchResults(res.results);
    } catch (e: unknown) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  /* --- キーワードトグル --- */
  const toggleKeyword = (kw: string) => {
    setSelectedKeywords((prev) =>
      prev.includes(kw) ? prev.filter((k) => k !== kw) : [...prev, kw],
    );
  };

  const addCustomKeyword = () => {
    const kw = customKw.trim();
    if (kw && !selectedKeywords.includes(kw)) {
      setSelectedKeywords((prev) => [...prev, kw]);
    }
    setCustomKw("");
  };

  /* --- キーワード編集保存 --- */
  const saveKeywords = async (companyId: string) => {
    const kws = editKws.split(",").map((s) => s.trim()).filter(Boolean);
    const pitchObj: Record<string, string> = {};
    editPitch.split("\n").forEach((line) => {
      const [key, ...rest] = line.split(":");
      if (key && rest.length) pitchObj[key.trim()] = rest.join(":").trim();
    });
    try {
      await updateCompanyKeywords(companyId, kws, pitchObj);
      setEditingId(null);
      if (mode === "list") await loadCompanies();
      if (mode === "match") await handleMatch();
    } catch (e: unknown) {
      console.error(e);
    }
  };

  /* --- Render --- */
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">紹介企業データベース</h1>
          <p className="text-sm text-gray-500 mt-1">
            候補者のキーワードに応じて最適な企業を訴求
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {syncing ? "同期中…" : "Pipedrive 同期"}
        </button>
      </div>

      {syncMsg && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800">
          {syncMsg}
        </div>
      )}

      {/* キーワード選択エリア */}
      <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-5">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">
          候補者の希望条件（キーワード）
        </h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {SUGGESTED_KEYWORDS.map((kw) => (
            <button
              key={kw}
              onClick={() => toggleKeyword(kw)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                selectedKeywords.includes(kw)
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {kw}
            </button>
          ))}
        </div>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            placeholder="カスタムキーワードを追加…"
            value={customKw}
            onChange={(e) => setCustomKw(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustomKeyword()}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
          <button
            onClick={addCustomKeyword}
            className="rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium hover:bg-gray-300"
          >
            追加
          </button>
        </div>

        {selectedKeywords.length > 0 && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm text-gray-500">選択中:</span>
            {selectedKeywords.map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center gap-1 rounded-full bg-primary-100 px-3 py-1 text-sm text-primary-700"
              >
                {kw}
                <button
                  onClick={() => toggleKeyword(kw)}
                  className="text-primary-400 hover:text-primary-600"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleMatch}
            disabled={selectedKeywords.length === 0 || loading}
            className="rounded-lg bg-primary-600 px-6 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            マッチング実行
          </button>
          <button
            onClick={loadCompanies}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            全企業一覧
          </button>
        </div>
      </div>

      {/* 企業名検索 */}
      {mode === "list" && (
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="企業名で検索…"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadCompanies()}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
          />
          <button
            onClick={loadCompanies}
            className="rounded-lg bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
          >
            検索
          </button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-8 text-gray-500">読み込み中…</div>
      )}

      {/* マッチ結果 */}
      {!loading && mode === "match" && matchResults.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">
            マッチ結果（{matchResults.length} 社）
          </h2>
          {matchResults.map((m) => (
            <CompanyCard
              key={m.company.id}
              company={m.company}
              matchedKeywords={m.matched_keywords}
              matchScore={m.match_score}
              pitchSummary={m.pitch_summary}
              isEditing={editingId === m.company.id}
              editKws={editKws}
              editPitch={editPitch}
              onEditStart={() => {
                setEditingId(m.company.id);
                setEditKws((m.company.keywords || []).join(", "));
                setEditPitch(
                  Object.entries(m.company.pitch_points || {})
                    .map(([k, v]) => `${k}: ${v}`)
                    .join("\n"),
                );
              }}
              onEditCancel={() => setEditingId(null)}
              onEditKwsChange={setEditKws}
              onEditPitchChange={setEditPitch}
              onSave={() => saveKeywords(m.company.id)}
            />
          ))}
        </div>
      )}

      {!loading && mode === "match" && matchResults.length === 0 && selectedKeywords.length > 0 && (
        <div className="text-center py-8 text-gray-400">
          該当する企業が見つかりませんでした。企業にキーワードを設定してください。
        </div>
      )}

      {/* 企業一覧 */}
      {!loading && mode === "list" && companies.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">
            企業一覧（{companies.length} 社）
          </h2>
          {companies.map((c) => (
            <CompanyCard
              key={c.id}
              company={c}
              isEditing={editingId === c.id}
              editKws={editKws}
              editPitch={editPitch}
              onEditStart={() => {
                setEditingId(c.id);
                setEditKws((c.keywords || []).join(", "));
                setEditPitch(
                  Object.entries(c.pitch_points || {})
                    .map(([k, v]) => `${k}: ${v}`)
                    .join("\n"),
                );
              }}
              onEditCancel={() => setEditingId(null)}
              onEditKwsChange={setEditKws}
              onEditPitchChange={setEditPitch}
              onSave={() => saveKeywords(c.id)}
            />
          ))}
        </div>
      )}

      {!loading && mode === "list" && companies.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          企業データがありません。「Pipedrive 同期」で取り込んでください。
        </div>
      )}
    </div>
  );
}

/* ---------- CompanyCard ---------- */

interface CompanyCardProps {
  company: CompanyItem;
  matchedKeywords?: string[];
  matchScore?: number;
  pitchSummary?: string[];
  isEditing: boolean;
  editKws: string;
  editPitch: string;
  onEditStart: () => void;
  onEditCancel: () => void;
  onEditKwsChange: (v: string) => void;
  onEditPitchChange: (v: string) => void;
  onSave: () => void;
}

function CompanyCard({
  company,
  matchedKeywords,
  matchScore,
  pitchSummary,
  isEditing,
  editKws,
  editPitch,
  onEditStart,
  onEditCancel,
  onEditKwsChange,
  onEditPitchChange,
  onSave,
}: CompanyCardProps) {
  return (
    <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-5">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900">{company.name}</h3>
          {company.address && (
            <p className="text-sm text-gray-500 mt-0.5">{company.address}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {matchScore !== undefined && (
            <span className="rounded-full bg-primary-100 px-3 py-1 text-sm font-bold text-primary-700">
              {matchScore} hit
            </span>
          )}
          <div className="text-right text-xs text-gray-400 space-y-0.5">
            <div>案件 {company.open_deals_count} 件</div>
            <div>成約 {company.won_deals_count} 件</div>
          </div>
        </div>
      </div>

      {/* マッチしたキーワード */}
      {matchedKeywords && matchedKeywords.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {matchedKeywords.map((kw) => (
            <span
              key={kw}
              className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700"
            >
              {kw}
            </span>
          ))}
        </div>
      )}

      {/* 訴求ポイント */}
      {pitchSummary && pitchSummary.length > 0 && (
        <div className="mt-3 rounded-lg bg-blue-50 p-3">
          <p className="text-xs font-semibold text-blue-700 mb-1">訴求ポイント</p>
          <ul className="space-y-1">
            {pitchSummary.map((s, i) => (
              <li key={i} className="text-sm text-blue-800">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 既存キーワード表示 */}
      {!isEditing && company.keywords.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {company.keywords.map((kw) => (
            <span
              key={kw}
              className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600"
            >
              {kw}
            </span>
          ))}
        </div>
      )}

      {/* 編集モード */}
      {isEditing ? (
        <div className="mt-4 space-y-3 border-t pt-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              キーワード（カンマ区切り）
            </label>
            <input
              type="text"
              value={editKws}
              onChange={(e) => onEditKwsChange(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder="残業少ない, 年収UP, 発注者側"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              訴求ポイント（1行1件、「キーワード: 説明」形式）
            </label>
            <textarea
              value={editPitch}
              onChange={(e) => onEditPitchChange(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              placeholder={"残業少ない: 月平均残業15h以下\n年収UP: 前職比20%UPの実績多数"}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={onSave}
              className="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
            >
              保存
            </button>
            <button
              onClick={onEditCancel}
              className="rounded-lg border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              キャンセル
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={onEditStart}
          className="mt-3 text-xs text-primary-600 hover:underline"
        >
          キーワード・訴求ポイントを編集
        </button>
      )}
    </div>
  );
}
