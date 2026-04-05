import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import {
  fetchCandidates,
  updateFollowUp,
  addCandidateAction,
  fetchMeetings,
  createMeeting,
  transcribeAudio,
  summarizeMeeting,
  type CandidateItem,
  type MeetingTranscript,
} from "../api/client";

const ACTION_TEMPLATES = [
  "電話フォロー", "メール送付", "求人情報送付", "面接日程調整",
  "条件面交渉", "内定通知", "入社日調整", "リマインド",
];

export default function PostMeeting() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"transcript" | "followup">("transcript");
  const [transcribing, setTranscribing] = useState(false);
  const [manualText, setManualText] = useState("");
  const [actionInput, setActionInput] = useState("");
  const [resultInput, setResultInput] = useState("");

  const { data: candidatesData } = useQuery({
    queryKey: ["candidates-all-post"],
    queryFn: () => fetchCandidates(),
  });

  const { data: meetingsData } = useQuery({
    queryKey: ["meetings", selectedId],
    queryFn: () => fetchMeetings(undefined, selectedId || undefined),
    enabled: !!selectedId,
  });

  const candidates = candidatesData?.candidates || [];
  const selected = candidates.find((c) => c.id === selectedId);
  const meetings = meetingsData?.transcripts || [];

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    setTranscribing(true);
    try {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      await transcribeAudio({
        audio_base64: base64,
        mime_type: file.type || "audio/webm",
        candidate_id: selectedId,
        title: `${selected?.name || ""} 面談録音`,
      });
      qc.invalidateQueries({ queryKey: ["meetings", selectedId] });
    } catch (e) { console.error(e); }
    setTranscribing(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSaveText = async () => {
    if (!manualText.trim() || !selectedId) return;
    await createMeeting({
      candidate_id: selectedId,
      title: `${selected?.name || ""} 面談記録`,
      transcript_text: manualText,
      source: "manual",
    });
    setManualText("");
    qc.invalidateQueries({ queryKey: ["meetings", selectedId] });
  };

  const summarizeMut = useMutation({
    mutationFn: (id: string) => summarizeMeeting(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["meetings", selectedId] }),
  });

  const followUpMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      updateFollowUp(id, data as { status?: string; follow_up_date?: string; follow_up_priority?: string; follow_up_notes?: string }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["candidates"] }),
  });

  const actionMut = useMutation({
    mutationFn: ({ id, action, result }: { id: string; action: string; result?: string }) =>
      addCandidateAction(id, action, result),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["candidates"] }); setActionInput(""); setResultInput(""); },
  });

  const overdueCandidates = candidates.filter((c) =>
    c.status !== "placed" && c.status !== "lost" && c.days_since_contact > 7
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">面談後</h1>
        <p className="text-sm text-gray-500 mt-1">議事録保存（Gemini文字起こし対応） → AI要約 → フォロー管理</p>
      </div>

      {overdueCandidates.length > 0 && (
        <div className="mb-4 rounded-xl bg-red-50 border border-red-200 p-4">
          <h3 className="text-sm font-semibold text-red-700 mb-2">フォロー漏れアラート（7日以上未連絡）</h3>
          <div className="flex flex-wrap gap-2">
            {overdueCandidates.map((c) => (
              <button key={c.id} onClick={() => { setSelectedId(c.id); setTab("followup"); }}
                className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm hover:bg-red-50">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-red-600 ml-2">{c.days_since_contact}日前</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-2">候補者</h2>
          {candidates.filter((c) => c.status !== "placed" && c.status !== "lost").map((c) => (
            <button key={c.id} onClick={() => { setSelectedId(c.id); setTab("transcript"); }}
              className={`w-full text-left rounded-lg border p-3 transition-colors ${selectedId === c.id ? "border-primary-500 bg-primary-50" : "border-gray-200 bg-white hover:border-gray-300"}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-gray-900">{c.name}</span>
                {c.days_since_contact > 7 && <span className="text-xs text-red-600">{c.days_since_contact}日</span>}
              </div>
              <div className="text-xs text-gray-500">{c.current_position || "未設定"}</div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-3 space-y-4">
          {selected ? (
            <>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                <button onClick={() => setTab("transcript")}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${tab === "transcript" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                  議事録・文字起こし
                </button>
                <button onClick={() => setTab("followup")}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${tab === "followup" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"}`}>
                  フォロー管理
                </button>
              </div>

              {tab === "transcript" && (
                <>
                  <div className="rounded-xl bg-white border border-gray-200 p-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">議事録を追加</h3>
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
                  </div>

                  {meetings.length > 0 && (
                    <div className="space-y-3">
                      {meetings.map((m: MeetingTranscript) => (
                        <div key={m.id} className="rounded-xl bg-white border border-gray-200 p-5">
                          <div className="flex items-center justify-between mb-3">
                            <div>
                              <h4 className="font-medium text-gray-900">{m.title}</h4>
                              <p className="text-xs text-gray-400">{new Date(m.recorded_at).toLocaleDateString("ja-JP")} / {m.source === "gemini" ? "Gemini文字起こし" : "手動入力"}</p>
                            </div>
                            {!m.summary && (
                              <button onClick={() => summarizeMut.mutate(m.id)} disabled={summarizeMut.isPending}
                                className="px-3 py-1.5 text-xs font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50">
                                {summarizeMut.isPending ? "要約中..." : "AI要約を生成"}
                              </button>
                            )}
                          </div>
                          {m.summary && (
                            <div className="rounded-lg bg-purple-50 border border-purple-200 p-3 mb-3">
                              <h5 className="text-xs font-semibold text-purple-700 mb-1">AI要約</h5>
                              <div className="prose prose-sm max-w-none text-sm"><ReactMarkdown>{m.summary}</ReactMarkdown></div>
                            </div>
                          )}
                          {m.action_items && m.action_items.length > 0 && (
                            <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 mb-3">
                              <h5 className="text-xs font-semibold text-yellow-700 mb-1">アクションアイテム</h5>
                              <ul className="text-sm space-y-1">{m.action_items.map((item, i) => <li key={i}>- {item}</li>)}</ul>
                            </div>
                          )}
                          <details className="text-sm">
                            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">全文を表示</summary>
                            <pre className="mt-2 text-xs text-gray-600 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg max-h-[300px] overflow-y-auto">{m.transcript_text}</pre>
                          </details>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              {tab === "followup" && (
                <div className="space-y-4">
                  <div className="rounded-xl bg-white border border-gray-200 p-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">フォロー設定</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">ステータス</label>
                        <select className="w-full border rounded-lg px-2 py-1.5 text-sm" value={selected.status}
                          onChange={(e) => followUpMut.mutate({ id: selected.id, data: { status: e.target.value } })}>
                          <option value="new">新規</option><option value="in_progress">進行中</option>
                          <option value="on_hold">保留</option><option value="placed">成約</option><option value="lost">離脱</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">次回フォロー日</label>
                        <input type="date" className="w-full border rounded-lg px-2 py-1.5 text-sm" value={selected.follow_up_date?.split("T")[0] || ""}
                          onChange={(e) => followUpMut.mutate({ id: selected.id, data: { follow_up_date: e.target.value } })} />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">優先度</label>
                        <select className="w-full border rounded-lg px-2 py-1.5 text-sm" value={selected.follow_up_priority}
                          onChange={(e) => followUpMut.mutate({ id: selected.id, data: { follow_up_priority: e.target.value } })}>
                          <option value="high">高</option><option value="medium">中</option><option value="low">低</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">最終連絡</label>
                        <p className={`text-sm font-medium ${selected.days_since_contact > 7 ? "text-red-600" : "text-gray-700"}`}>{selected.days_since_contact}日前</p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl bg-white border border-gray-200 p-5">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">アクション記録</h3>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {ACTION_TEMPLATES.map((t) => (
                        <button key={t} onClick={() => setActionInput(t)}
                          className={`text-xs rounded-full px-3 py-1 border transition-colors ${actionInput === t ? "border-primary-500 bg-primary-50 text-primary-700" : "border-gray-200 hover:border-gray-300"}`}>
                          {t}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input className="flex-1 border rounded-lg px-3 py-2 text-sm" value={actionInput} onChange={(e) => setActionInput(e.target.value)} placeholder="アクション内容" />
                      <input className="flex-1 border rounded-lg px-3 py-2 text-sm" value={resultInput} onChange={(e) => setResultInput(e.target.value)} placeholder="結果（任意）" />
                      <button onClick={() => actionMut.mutate({ id: selected.id, action: actionInput, result: resultInput })} disabled={!actionInput}
                        className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50">記録</button>
                    </div>
                  </div>

                  {selected.action_history && selected.action_history.length > 0 && (
                    <div className="rounded-xl bg-white border border-gray-200 p-5">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">対応履歴</h3>
                      <div className="space-y-2">
                        {[...selected.action_history].reverse().map((a, i) => (
                          <div key={i} className="flex items-start gap-3 text-sm border-l-2 border-gray-200 pl-3">
                            <span className="text-xs text-gray-400 whitespace-nowrap">{a.date}</span>
                            <div><span className="font-medium text-gray-700">{a.action}</span>{a.result && <span className="text-gray-500 ml-2">→ {a.result}</span>}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl bg-white shadow-sm border border-gray-200 p-12 text-center text-gray-400">
              <p className="text-lg mb-2">候補者を選択してください</p>
              <p className="text-xs">議事録の保存・AI要約・フォロー管理ができます</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
