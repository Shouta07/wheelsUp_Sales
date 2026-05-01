import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { useGamification } from "../../gamification/GamificationProvider";
import {
  fetchMeetings,
  createMeeting,
  transcribeAudio,
  summarizeMeeting,
  scoreMeeting,
  type MeetingTranscript,
  type MeetingScore,
} from "../../api/client";
import MeetingScoreCard from "./MeetingScoreCard";

export default function MeetingHub() {
  const { currentUser } = useGamification();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"mine" | "leader">("mine");
  const [uploading, setUploading] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [showUpload, setShowUpload] = useState(false);

  const { data: myMeetings } = useQuery({
    queryKey: ["meetings", "mine", currentUser],
    queryFn: () => fetchMeetings(undefined, undefined, currentUser, false),
    enabled: !!currentUser,
  });

  const { data: leaderMeetings } = useQuery({
    queryKey: ["meetings", "leader"],
    queryFn: () => fetchMeetings(undefined, undefined, undefined, true),
  });

  const meetings = tab === "mine" ? myMeetings?.transcripts : leaderMeetings?.transcripts;

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
      await transcribeAudio({
        audio_base64: base64,
        mime_type: file.type || "audio/webm",
        title: titleInput || `${currentUser} 面談録音`,
        consultant_name: tab === "leader" ? undefined : currentUser,
        is_leader: tab === "leader",
      });
      qc.invalidateQueries({ queryKey: ["meetings"] });
      setTitleInput("");
    } catch (err) { console.error(err); }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleTextSave = async () => {
    if (!textInput.trim()) return;
    setUploading(true);
    try {
      await createMeeting({
        title: titleInput || `${tab === "leader" ? "リーダー" : currentUser} 面談記録`,
        transcript_text: textInput,
        consultant_name: tab === "leader" ? undefined : currentUser,
        is_leader: tab === "leader",
        source: "manual",
      });
      qc.invalidateQueries({ queryKey: ["meetings"] });
      setTextInput("");
      setTitleInput("");
      setShowUpload(false);
    } catch (err) { console.error(err); }
    setUploading(false);
  };

  const handleSummarize = async (id: string) => {
    await summarizeMeeting(id);
    qc.invalidateQueries({ queryKey: ["meetings"] });
  };

  // Calculate leader average scores
  const leaderScores = (leaderMeetings?.transcripts || [])
    .filter((m: MeetingTranscript) => m.score_data?.scores)
    .map((m: MeetingTranscript) => m.score_data!);

  const leaderAvg = leaderScores.length > 0 ? {
    needs: Math.round(leaderScores.reduce((s: number, d: MeetingScore) => s + d.scores.needs, 0) / leaderScores.length),
    proposal: Math.round(leaderScores.reduce((s: number, d: MeetingScore) => s + d.scores.proposal, 0) / leaderScores.length),
    trust: Math.round(leaderScores.reduce((s: number, d: MeetingScore) => s + d.scores.trust, 0) / leaderScores.length),
    closing: Math.round(leaderScores.reduce((s: number, d: MeetingScore) => s + d.scores.closing, 0) / leaderScores.length),
    intel: Math.round(leaderScores.reduce((s: number, d: MeetingScore) => s + d.scores.intel, 0) / leaderScores.length),
  } : null;

  return (
    <div className="card-duo p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-duo-blue flex items-center justify-center" style={{ borderBottom: "2px solid #1899d6" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/></svg>
          </div>
          <span className="text-base font-extrabold text-[#4b4b4b]">面談ライブラリ</span>
        </div>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="btn-duo btn-duo-green !px-3 !py-1.5 !text-[10px]"
        >
          + 面談を追加
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4">
        {([
          { key: "mine" as const, label: "自分の面談", count: myMeetings?.total || 0 },
          { key: "leader" as const, label: "リーダーの面談", count: leaderMeetings?.total || 0 },
        ]).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-xl text-xs font-extrabold transition-colors ${
              tab === key
                ? key === "leader" ? "bg-duo-orange/10 text-duo-orange" : "bg-duo-blue/10 text-duo-blue"
                : "text-[#afafaf] hover:bg-[#f7f7f7]"
            }`}
          >
            {label}（{count}）
          </button>
        ))}
      </div>

      {/* Upload area */}
      {showUpload && (
        <div className="rounded-2xl border-2 border-dashed border-[#e5e5e5] p-4 mb-4 space-y-3">
          <input
            type="text"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            placeholder="タイトル（例: 佐藤様 初回面談）"
            className="w-full rounded-xl border-2 border-[#e5e5e5] px-3 py-2 text-sm font-bold text-[#4b4b4b] focus:border-duo-blue focus:outline-none"
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center">
              <input ref={fileRef} type="file" accept="audio/*,video/*" className="hidden" onChange={handleAudioUpload} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full rounded-xl border-2 border-[#e5e5e5] px-3 py-4 hover:border-duo-blue hover:bg-duo-blue/5 transition-colors"
              >
                <span className="text-2xl block mb-1">🎙️</span>
                <span className="text-xs font-bold text-[#777]">
                  {uploading ? "Geminiで分析中..." : "録音・録画ファイル"}
                </span>
              </button>
            </div>
            <div className="text-center">
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="議事録テキストを貼り付け..."
                className="w-full rounded-xl border-2 border-[#e5e5e5] px-3 py-2 text-xs font-bold text-[#4b4b4b] h-20 focus:border-duo-blue focus:outline-none resize-none"
              />
              <button
                onClick={handleTextSave}
                disabled={!textInput.trim() || uploading}
                className="btn-duo btn-duo-blue !px-4 !py-1.5 !text-[10px] mt-1 w-full disabled:opacity-40"
              >
                テキスト保存
              </button>
            </div>
          </div>
          <p className="text-[10px] font-bold text-[#afafaf] text-center">
            {tab === "leader" ? "👑 リーダーの面談として保存されます" : `📝 ${currentUser}の面談として保存されます`}
          </p>
        </div>
      )}

      {/* Meeting list */}
      <div className="space-y-3">
        {(!meetings || meetings.length === 0) && (
          <div className="rounded-2xl bg-[#f7f7f7] p-6 text-center">
            <span className="text-3xl block mb-2">{tab === "leader" ? "👑" : "📝"}</span>
            <p className="text-sm font-bold text-[#777]">
              {tab === "leader"
                ? "リーダーの面談を追加して、対比の基準を作りましょう"
                : "面談を記録してAIに採点してもらいましょう"
              }
            </p>
          </div>
        )}

        {(meetings || []).map((m: MeetingTranscript) => (
          <MeetingEntry
            key={m.id}
            meeting={m}
            leaderAvg={leaderAvg}
            onSummarize={handleSummarize}
          />
        ))}
      </div>
    </div>
  );
}

function MeetingEntry({
  meeting: m,
  leaderAvg,
  onSummarize,
}: {
  meeting: MeetingTranscript;
  leaderAvg: Record<string, number> | null;
  onSummarize: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const score = m.score_data;

  return (
    <div className="rounded-2xl border-2 border-[#e5e5e5] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#f7f7f7] transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm shrink-0">{m.is_leader ? "👑" : "📝"}</span>
          <div className="min-w-0">
            <span className="text-sm font-bold text-[#4b4b4b] truncate block">{m.title}</span>
            <span className="text-[10px] font-bold text-[#afafaf]">
              {new Date(m.recorded_at).toLocaleDateString("ja-JP")}
              {m.consultant_name && ` · ${m.consultant_name}`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {score && (
            <span
              className="text-xs font-black px-2 py-0.5 rounded-lg text-white"
              style={{
                backgroundColor:
                  score.grade === "S" ? "#FFC800" :
                  score.grade === "A" ? "#58CC02" :
                  score.grade === "B" ? "#1CB0F6" :
                  score.grade === "C" ? "#FF9600" : "#FF4B4B",
              }}
            >
              {score.grade} ({score.total}/50)
            </span>
          )}
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="#afafaf"
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Actions */}
          <div className="flex gap-2">
            {!m.summary && (
              <button
                onClick={() => onSummarize(m.id)}
                className="btn-duo !px-3 !py-1.5 !text-[10px] !rounded-xl text-white"
                style={{ backgroundColor: "#CE82FF", borderBottomColor: "#a85fd6" }}
              >
                AI要約
              </button>
            )}
            {!score && (
              <MeetingScoreCard meetingId={m.id} meetingTitle={m.title} />
            )}
          </div>

          {/* Summary */}
          {m.summary && (
            <div className="rounded-xl bg-[#f7f7f7] p-3 prose prose-sm max-w-none text-xs text-[#4b4b4b]">
              <ReactMarkdown>{m.summary}</ReactMarkdown>
            </div>
          )}

          {/* Score details */}
          {score?.scores && (
            <ScoreComparison score={score} leaderAvg={leaderAvg} isLeader={m.is_leader} />
          )}

          {/* Leader would */}
          {score?.leader_would && (
            <div className="rounded-xl bg-duo-purple/5 border border-duo-purple/20 p-3">
              <div className="text-[10px] font-extrabold text-duo-purple uppercase tracking-wider mb-1">リーダーならこうしてた</div>
              <p className="text-xs font-bold text-[#4b4b4b] leading-relaxed">{score.leader_would}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const DIMS = [
  { key: "needs", label: "ニーズ", color: "#1CB0F6" },
  { key: "proposal", label: "提案", color: "#58CC02" },
  { key: "trust", label: "信頼", color: "#CE82FF" },
  { key: "closing", label: "成約", color: "#FF9600" },
  { key: "intel", label: "情報", color: "#FF4B4B" },
] as const;

function ScoreComparison({
  score,
  leaderAvg,
  isLeader,
}: {
  score: MeetingScore;
  leaderAvg: Record<string, number> | null;
  isLeader: boolean;
}) {
  return (
    <div className="space-y-2">
      {DIMS.map(({ key, label, color }) => {
        const val = score.scores[key as keyof typeof score.scores];
        const ldr = leaderAvg?.[key] ?? null;
        const gap = ldr !== null ? val - ldr : null;

        return (
          <div key={key}>
            <div className="flex items-center justify-between mb-0.5">
              <span className="text-[10px] font-bold text-[#777] w-10">{label}</span>
              <div className="flex items-center gap-2">
                {!isLeader && gap !== null && (
                  <span className={`text-[10px] font-black ${gap >= 0 ? "text-duo-green" : "text-duo-red"}`}>
                    {gap >= 0 ? `+${gap}` : gap} vs リーダー
                  </span>
                )}
                <span className="text-xs font-black w-5 text-right" style={{ color }}>{val}</span>
              </div>
            </div>
            <div className="relative h-3 bg-[#e5e5e5] rounded-full overflow-hidden">
              <div
                className="absolute h-full rounded-full transition-all duration-700"
                style={{ width: `${val * 10}%`, backgroundColor: color }}
              />
              {!isLeader && ldr !== null && (
                <div
                  className="absolute top-0 h-full w-0.5 bg-[#4b4b4b] opacity-40"
                  style={{ left: `${ldr * 10}%` }}
                  title={`リーダー平均: ${ldr}`}
                />
              )}
            </div>
          </div>
        );
      })}

      {score.strengths?.length > 0 && (
        <div className="pt-1">
          <span className="text-[10px] font-extrabold text-duo-green uppercase tracking-wider">強み: </span>
          {score.strengths.map((s) => (
            <span key={s} className="text-[10px] font-bold text-duo-green bg-duo-green/10 px-1.5 py-0.5 rounded-lg mr-1">{s}</span>
          ))}
        </div>
      )}
      {score.improvements?.length > 0 && (
        <div>
          <span className="text-[10px] font-extrabold text-duo-orange uppercase tracking-wider">改善: </span>
          {score.improvements.map((s) => (
            <span key={s} className="text-[10px] font-bold text-duo-orange bg-duo-orange/10 px-1.5 py-0.5 rounded-lg mr-1">{s}</span>
          ))}
        </div>
      )}
    </div>
  );
}
