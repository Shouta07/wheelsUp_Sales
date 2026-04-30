import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import {
  fetchRecommendations,
  addCandidateAction,
  updateFollowUp,
  updateRecommendation,
  transcribeAudio,
  createMeeting,
  fetchMeetings,
  summarizeMeeting,
  type RecommendationItem,
  type MeetingTranscript,
} from "../api/client";
import { useRecommendationChecklist } from "../hooks/usePhaseProgress";
import PhaseCoaching from "../components/gamification/PhaseCoaching";
import MeetingScoreCard from "../components/gamification/MeetingScoreCard";

const CANDIDATE_SECTIONS = [
  { section: "30分以内", items: [
    { id: "ca1", label: "Pipedrive にヒアリング結果を記録", hint: "温度感・希望条件・優先順位を構造化して入力", tag: "30分以内" },
    { id: "ca2", label: "議事録を保存（Gemini文字起こし or 手動）", hint: "音声アップロード → 自動要約が最速", tag: "30分以内" },
    { id: "ca3", label: "求人マッチング開始（キーワード×条件）", hint: "面談中に発見したキーワードでマッチング実行", tag: "30分以内" },
  ]},
  { section: "当日中", items: [
    { id: "ca4", label: "お礼メール + 期日宣言（3日以内に求人送付）", tag: "当日中" },
  ]},
  { section: "3日以内", items: [
    { id: "ca5", label: "マッチ求人を3件以上送付", hint: "「なぜこの求人を薦めるか」を1行添える", tag: "3日以内" },
    { id: "ca6", label: "Pipedrive リマインダー設定（次回フォロー日）", tag: "3日以内" },
  ]},
];

const COMPANY_SECTIONS = [
  { section: "30分以内", items: [
    { id: "co1", label: "Pipedrive ステージを更新", hint: "商談→提案中/候補者紹介待ち等に遷移", tag: "30分以内" },
    { id: "co2", label: "議事録を保存", hint: "合意事項・料率・採用要件を記録", tag: "30分以内" },
    { id: "co3", label: "フィー試算（年収レンジ × 料率）", tag: "30分以内" },
  ]},
  { section: "当日中", items: [
    { id: "co4", label: "お礼メール + 合意サマリ送付", tag: "当日中" },
  ]},
  { section: "3日以内", items: [
    { id: "co5", label: "候補者推薦文を送付", hint: "要件×強みを軸にした推薦文", tag: "3日以内" },
    { id: "co6", label: "Pipedrive フォロー設定", tag: "3日以内" },
  ]},
];

const TAG_COLORS: Record<string, string> = {
  "30分以内": "bg-red-100 text-red-700",
  "当日中": "bg-orange-100 text-orange-700",
  "3日以内": "bg-blue-100 text-blue-700",
};

const ACTION_TEMPLATES = [
  "電話フォロー", "メール送付", "求人情報送付", "面接日程調整",
  "条件面交渉", "推薦文送付", "リマインド",
];

export default function Phase3After() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [manualText, setManualText] = useState("");
  const [actionInput, setActionInput] = useState("");
  const [resultInput, setResultInput] = useState("");

  const { data } = useQuery({
    queryKey: ["recommendations-active"],
    queryFn: () => fetchRecommendations(),
  });

  const recommendations = (data?.recommendations || []).filter(
    (r) => r.status !== "placed" && r.status !== "rejected" && r.status !== "withdrawn",
  );
  const selected = recommendations.find((r) => r.id === selectedId);

  const { data: meetingsData } = useQuery({
    queryKey: ["meetings", selected?.candidate_id],
    queryFn: () => fetchMeetings(undefined, selected!.candidate_id),
    enabled: !!selected,
  });
  const meetings = meetingsData?.transcripts || [];

  const candidateChecklist = useRecommendationChecklist(selectedId, 3, "candidate", selected?.phase3_candidate || []);
  const companyChecklist = useRecommendationChecklist(selectedId, 3, "company", selected?.phase3_company || []);

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    setTranscribing(true);
    try {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      await transcribeAudio({
        audio_base64: base64,
        mime_type: file.type || "audio/webm",
        candidate_id: selected.candidate_id,
        title: `${selected.candidates.name} × ${selected.companies.name} 面談録音`,
      });
      qc.invalidateQueries({ queryKey: ["meetings"] });
    } catch (e) { console.error(e); }
    setTranscribing(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSaveText = async () => {
    if (!manualText.trim() || !selected) return;
    await createMeeting({
      candidate_id: selected.candidate_id,
      title: `${selected.candidates.name} × ${selected.companies.name} 面談記録`,
      transcript_text: manualText,
      source: "manual",
    });
    setManualText("");
    qc.invalidateQueries({ queryKey: ["meetings"] });
  };

  const summarizeMut = useMutation({
    mutationFn: (id: string) => summarizeMeeting(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meetings"] }),
  });

  const actionMut = useMutation({
    mutationFn: ({ id, action, result }: { id: string; action: string; result?: string }) =>
      addCandidateAction(id, action, result),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["recommendations-active"] }); setActionInput(""); setResultInput(""); },
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateRecommendation(id, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recommendations-active"] }),
  });

  const followUpMut = useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) =>
      updateFollowUp(id, { follow_up_date: date }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recommendations-active"] }),
  });

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
        <h1 className="text-2xl font-bold text-gray-900">③ 直後対応</h1>
        <p className="text-sm text-gray-500 mt-1">30分ルール ─ 議事録保存 → Pipedrive記録 → ネクストアクション設定</p>
      </div>

      {/* 推薦案件選択 */}
      <div className="mb-6">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {recommendations.map((rec) => (
            <button key={rec.id} onClick={() => setSelectedId(selectedId === rec.id ? null : rec.id)}
              className={`flex-shrink-0 rounded-lg border px-4 py-2 text-sm transition-colors ${selectedId === rec.id ? "border-primary-500 bg-primary-50 ring-1 ring-primary-500" : "border-gray-200 bg-white hover:border-gray-300"}`}>
              <span className="font-medium">{rec.candidates.name}</span>
              <span className="text-gray-400 mx-1">→</span>
              <span className="font-medium">{rec.companies.name}</span>
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <>
          {/* 議事録保存 */}
          <div className="mb-6 rounded-xl bg-white border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">議事録を保存</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border-2 border-dashed border-gray-300 p-4 text-center">
                <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={handleAudioUpload} />
                <button onClick={() => fileRef.current?.click()} disabled={transcribing}
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium disabled:opacity-50">
                  {transcribing ? "Gemini で文字起こし中..." : "音声ファイルをアップロード"}
                </button>
                <p className="text-xs text-gray-400 mt-1">Gemini 2.0 Flash で自動文字起こし + 要約</p>
              </div>
              <div>
                <textarea className="w-full border rounded-lg px-3 py-2 text-sm h-24" value={manualText} onChange={(e) => setManualText(e.target.value)} placeholder="テキストで直接入力..." />
                <button onClick={handleSaveText} disabled={!manualText.trim()}
                  className="mt-1 px-3 py-1 text-xs font-medium text-white bg-primary-600 rounded hover:bg-primary-700 disabled:opacity-50">
                  テキスト保存
                </button>
              </div>
            </div>

            {meetings.length > 0 && (
              <div className="mt-4 space-y-3">
                {meetings.slice(0, 3).map((m: MeetingTranscript) => (
                  <div key={m.id} className="rounded-lg border border-gray-100 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-sm">{m.title}</span>
                        <span className="text-xs text-gray-400 ml-2">{new Date(m.recorded_at).toLocaleDateString("ja-JP")}</span>
                      </div>
                      <div className="flex gap-2">
                        {!m.summary && (
                          <button onClick={() => summarizeMut.mutate(m.id)} disabled={summarizeMut.isPending}
                            className="px-2 py-1 text-xs font-medium text-white bg-purple-600 rounded hover:bg-purple-700 disabled:opacity-50">
                            AI要約
                          </button>
                        )}
                        <MeetingScoreCard meetingId={m.id} meetingTitle={m.title} />
                      </div>
                    </div>
                    {m.summary && (
                      <div className="mt-2 rounded bg-purple-50 p-2 prose prose-sm max-w-none text-xs">
                        <ReactMarkdown>{m.summary}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* AIコーチング */}
          <div className="mb-6">
            <PhaseCoaching
              phase={3}
              candidateId={selected.candidate_id}
              companyId={selected.company_id}
              dealId={selected.deal_id || undefined}
              candidateName={selected.candidates.name}
              companyName={selected.companies.name}
            />
          </div>

          {/* ネクストアクション + ステータス */}
          <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl bg-white border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">ネクストアクション</h3>
              <div className="flex flex-wrap gap-2 mb-3">
                {ACTION_TEMPLATES.map((t) => (
                  <button key={t} onClick={() => setActionInput(t)}
                    className={`text-xs rounded-full px-3 py-1 border transition-colors ${actionInput === t ? "border-primary-500 bg-primary-50 text-primary-700" : "border-gray-200 hover:border-gray-300"}`}>
                    {t}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input className="flex-1 border rounded-lg px-3 py-2 text-sm" value={actionInput} onChange={(e) => setActionInput(e.target.value)} placeholder="アクション" />
                <input className="flex-1 border rounded-lg px-3 py-2 text-sm" value={resultInput} onChange={(e) => setResultInput(e.target.value)} placeholder="結果（任意）" />
                <button onClick={() => actionMut.mutate({ id: selected.candidate_id, action: actionInput, result: resultInput })} disabled={!actionInput}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">記録</button>
              </div>
            </div>

            <div className="rounded-xl bg-white border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">ステータス・フォロー日</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">推薦ステータス</label>
                  <select className="w-full border rounded-lg px-2 py-1.5 text-sm" value={selected.status}
                    onChange={(e) => statusMut.mutate({ id: selected.id, status: e.target.value })}>
                    <option value="proposed">提案中</option>
                    <option value="screening">書類選考</option>
                    <option value="interviewing">面接中</option>
                    <option value="offered">内定</option>
                    <option value="placed">成約</option>
                    <option value="rejected">見送り</option>
                    <option value="withdrawn">辞退</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">次回フォロー日</label>
                  <input type="date" className="w-full border rounded-lg px-2 py-1.5 text-sm"
                    onChange={(e) => followUpMut.mutate({ id: selected.candidate_id, date: e.target.value })} />
                </div>
              </div>
            </div>
          </div>

          {/* チェックリスト */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl bg-white border border-gray-200 p-5">
              <h2 className="text-center text-sm font-bold text-gray-700 mb-3 pb-2 border-b">TO 候補者 面談後</h2>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex-1 bg-gray-200 rounded-full h-1.5"><div className="bg-primary-600 h-1.5 rounded-full transition-all" style={{ width: `${(candidateChecklist.checkedCount / totalC) * 100}%` }} /></div>
                <span className="text-xs text-gray-400">{candidateChecklist.checkedCount}/{totalC}</span>
              </div>
              {renderChecklist(CANDIDATE_SECTIONS, candidateChecklist.checked, candidateChecklist.toggle)}
            </div>
            <div className="rounded-xl bg-white border border-gray-200 p-5">
              <h2 className="text-center text-sm font-bold text-gray-700 mb-3 pb-2 border-b">TO 求人企業 商談後</h2>
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
          記録がデータになる ─ 面談の記録をPipedriveに残すことで次回以降の商談精度が上がる。ネクストアクションは必ず期日付きで設定する
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
