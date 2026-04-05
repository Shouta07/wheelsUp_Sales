import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchJobs,
  createJob,
  updateJob,
  deleteJob,
  importJobs,
  matchJobs,
  fetchCompanies,
  fetchCandidates,
  type JobPosting,
  type JobCreateData,
  type JobMatchResult,
  type CompanyItem,
  type CandidateItem,
} from "../api/client";

/* ── CSV パーサー（簡易） ── */
function parseCSV(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ""; });
    return obj;
  });
}

/* ── ステータスバッジ ── */
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: "bg-green-100 text-green-800",
    closed: "bg-gray-100 text-gray-600",
    draft: "bg-yellow-100 text-yellow-800",
  };
  const labels: Record<string, string> = {
    open: "募集中",
    closed: "終了",
    draft: "下書き",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[status] || colors.draft}`}>
      {labels[status] || status}
    </span>
  );
}

/* ── 求人フォームモーダル ── */
function JobFormModal({
  job,
  companies,
  onSave,
  onClose,
}: {
  job: JobPosting | null;
  companies: CompanyItem[];
  onSave: (data: JobCreateData) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<JobCreateData>({
    title: job?.title || "",
    company_id: job?.company_id || undefined,
    position_type: job?.position_type || "",
    employment_type: job?.employment_type || "正社員",
    salary_min: job?.salary_min || undefined,
    salary_max: job?.salary_max || undefined,
    location: job?.location || "",
    description: job?.description || "",
    requirements: job?.requirements || [],
    preferred: job?.preferred || [],
    required_qualifications: job?.required_qualifications || [],
    benefits: job?.benefits || "",
    keywords: job?.keywords || [],
    status: job?.status || "open",
    notes: job?.notes || "",
  });

  const set = (k: keyof JobCreateData, v: unknown) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">
          {job ? "求人を編集" : "求人を追加"}
        </h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">求人タイトル *</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="例: 施工管理（建築）"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">企業</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.company_id || ""}
                onChange={(e) => set("company_id", e.target.value || undefined)}
              >
                <option value="">-- 選択 --</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">職種</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.position_type || ""}
                onChange={(e) => set("position_type", e.target.value)}
                placeholder="例: 施工管理"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">雇用形態</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.employment_type || "正社員"}
                onChange={(e) => set("employment_type", e.target.value)}
              >
                <option>正社員</option>
                <option>契約社員</option>
                <option>派遣</option>
                <option>業務委託</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">年収下限（万円）</label>
              <input
                type="number"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.salary_min || ""}
                onChange={(e) => set("salary_min", e.target.value ? parseInt(e.target.value) : undefined)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">年収上限（万円）</label>
              <input
                type="number"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.salary_max || ""}
                onChange={(e) => set("salary_max", e.target.value ? parseInt(e.target.value) : undefined)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">勤務地</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={form.location || ""}
              onChange={(e) => set("location", e.target.value)}
              placeholder="例: 東京都港区"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">仕事内容</label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm"
              rows={3}
              value={form.description || ""}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">必須条件（カンマ区切り）</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={(form.requirements || []).join("、")}
              onChange={(e) => set("requirements", e.target.value.split(/[,、]/).map(s => s.trim()).filter(Boolean))}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">必要資格（カンマ区切り）</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={(form.required_qualifications || []).join("、")}
              onChange={(e) => set("required_qualifications", e.target.value.split(/[,、]/).map(s => s.trim()).filter(Boolean))}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">キーワード（カンマ区切り）</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={(form.keywords || []).join("、")}
              onChange={(e) => set("keywords", e.target.value.split(/[,、]/).map(s => s.trim()).filter(Boolean))}
              placeholder="マッチング用キーワード"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ステータス</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.status || "open"}
                onChange={(e) => set("status", e.target.value)}
              >
                <option value="open">募集中</option>
                <option value="draft">下書き</option>
                <option value="closed">終了</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">備考</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form.notes || ""}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            キャンセル
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={!form.title}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {job ? "更新" : "作成"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── メインページ ── */
export default function JobPostings() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editing, setEditing] = useState<JobPosting | null | "new">(null);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: string[] } | null>(null);
  const [matchCandidate, setMatchCandidate] = useState("");
  const [matchResults, setMatchResults] = useState<JobMatchResult[] | null>(null);
  const [matchLoading, setMatchLoading] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["jobs", search, statusFilter],
    queryFn: () => fetchJobs(search || undefined, statusFilter || undefined),
  });

  const { data: companiesData } = useQuery({
    queryKey: ["companies-all"],
    queryFn: () => fetchCompanies(),
  });

  const { data: candidatesData } = useQuery({
    queryKey: ["candidates-all"],
    queryFn: () => fetchCandidates(),
  });

  const createMut = useMutation({
    mutationFn: (d: JobCreateData) => createJob(d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["jobs"] }); setEditing(null); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Partial<JobCreateData> }) => updateJob(id, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["jobs"] }); setEditing(null); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });

  const handleSave = (d: JobCreateData) => {
    if (editing && editing !== "new") {
      updateMut.mutate({ id: (editing as JobPosting).id, d });
    } else {
      createMut.mutate(d);
    }
  };

  const handleCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length === 0) {
      setImportResult({ created: 0, updated: 0, errors: ["CSVにデータ行がありません"] });
      return;
    }
    try {
      const result = await importJobs(rows);
      setImportResult(result);
      qc.invalidateQueries({ queryKey: ["jobs"] });
    } catch (err) {
      setImportResult({ created: 0, updated: 0, errors: [(err as Error).message] });
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleMatch = async () => {
    if (!matchCandidate) return;
    setMatchLoading(true);
    try {
      const res = await matchJobs({ candidate_id: matchCandidate });
      setMatchResults(res.results);
    } catch {
      setMatchResults([]);
    }
    setMatchLoading(false);
  };

  const jobs = data?.jobs || [];
  const companies = companiesData?.companies || [];
  const candidates = candidatesData?.candidates || [];

  return (
    <main className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">求人管理</h1>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleCSV}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            CSVインポート
          </button>
          <button
            onClick={() => setEditing("new")}
            className="px-3 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
          >
            + 求人を追加
          </button>
        </div>
      </div>

      {/* インポート結果 */}
      {importResult && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-blue-800">
              インポート完了: 新規 {importResult.created}件、更新 {importResult.updated}件
            </p>
            <button onClick={() => setImportResult(null)} className="text-xs text-blue-600 hover:underline">閉じる</button>
          </div>
          {importResult.errors.length > 0 && (
            <ul className="mt-2 text-xs text-red-600 space-y-0.5">
              {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* フィルター */}
      <div className="flex gap-3 mb-4">
        <input
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
          placeholder="タイトル・勤務地で検索..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="border rounded-lg px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">全ステータス</option>
          <option value="open">募集中</option>
          <option value="draft">下書き</option>
          <option value="closed">終了</option>
        </select>
      </div>

      {/* 候補者マッチング */}
      <div className="mb-6 rounded-xl border border-purple-200 bg-purple-50 p-4">
        <h2 className="text-sm font-semibold text-purple-800 mb-2">候補者 × 求人マッチング</h2>
        <div className="flex gap-2">
          <select
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
            value={matchCandidate}
            onChange={(e) => { setMatchCandidate(e.target.value); setMatchResults(null); }}
          >
            <option value="">候補者を選択...</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.current_position ? `(${c.current_position})` : ""}
              </option>
            ))}
          </select>
          <button
            onClick={handleMatch}
            disabled={!matchCandidate || matchLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            {matchLoading ? "検索中..." : "マッチング実行"}
          </button>
        </div>
        {matchResults !== null && (
          <div className="mt-3">
            {matchResults.length === 0 ? (
              <p className="text-sm text-purple-600">マッチする求人が見つかりませんでした</p>
            ) : (
              <div className="space-y-2">
                {matchResults.map((r) => (
                  <div key={r.job.id} className="bg-white rounded-lg border border-purple-200 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-sm text-gray-900">{r.job.title}</span>
                        {r.job.companies && (
                          <span className="text-xs text-gray-500 ml-2">{r.job.companies.name}</span>
                        )}
                      </div>
                      <span className="text-xs font-medium text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                        スコア: {r.match_score}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.matched_keywords.map((kw) => (
                        <span key={kw} className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                          {kw}
                        </span>
                      ))}
                    </div>
                    {r.job.salary_min && (
                      <p className="text-xs text-gray-500 mt-1">
                        年収: {r.job.salary_min}〜{r.job.salary_max || "?"}万円 / {r.job.location || "勤務地未定"}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 求人一覧 */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">読み込み中...</div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>求人がまだありません</p>
          <p className="text-xs mt-1">「+ 求人を追加」またはCSVインポートで登録してください</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="rounded-xl border border-gray-200 bg-white p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-900">{job.title}</span>
                    <StatusBadge status={job.status} />
                    {job.source === "spreadsheet" && (
                      <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">CSV</span>
                    )}
                  </div>
                  <div className="text-sm text-gray-600">
                    {job.companies && <span className="font-medium">{job.companies.name}</span>}
                    {job.position_type && <span className="ml-2">{job.position_type}</span>}
                    {job.employment_type && <span className="ml-2 text-gray-400">{job.employment_type}</span>}
                  </div>
                  <div className="text-xs text-gray-500 mt-1 flex items-center gap-3">
                    {(job.salary_min || job.salary_max) && (
                      <span>年収 {job.salary_min || "?"}〜{job.salary_max || "?"}万円</span>
                    )}
                    {job.location && <span>{job.location}</span>}
                  </div>
                  {job.keywords.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {job.keywords.map((kw) => (
                        <span key={kw} className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 ml-3">
                  <button
                    onClick={() => setEditing(job)}
                    className="px-2 py-1 text-xs text-gray-600 hover:text-primary-600 border rounded"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`「${job.title}」を削除しますか？`)) deleteMut.mutate(job.id);
                    }}
                    className="px-2 py-1 text-xs text-red-500 hover:text-red-700 border border-red-200 rounded"
                  >
                    削除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 編集モーダル */}
      {editing && (
        <JobFormModal
          job={editing === "new" ? null : editing}
          companies={companies}
          onSave={handleSave}
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  );
}
