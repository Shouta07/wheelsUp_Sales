import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { useGamification } from "../../gamification/GamificationProvider";
import { isLeader as isLeaderRole, getLeaderNames } from "../../lib/team";
import {
  fetchMeetings,
  createMeeting,
  transcribeAudio,
  summarizeMeeting,
  addLeaderFeedback,
  scoreMeeting,
  deleteMeeting,
  type MeetingTranscript,
  type MeetingScore,
  type KeyMoment,
} from "../../api/client";

const AUDIO_MAX_BYTES = 4 * 1024 * 1024;
const todayInputValue = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

export default function MeetingHub() {
  const { currentUser } = useGamification();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"mine" | "leader">("mine");
  const [uploading, setUploading] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [dateInput, setDateInput] = useState<string>(todayInputValue);
  const [showUpload, setShowUpload] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isLeaderUser = isLeaderRole(currentUser);

  const { data: myMeetings } = useQuery({
    queryKey: ["meetings", "mine", currentUser],
    queryFn: () => fetchMeetings(undefined, undefined, currentUser),
    enabled: !!currentUser,
    refetchInterval: (query) => {
      const hasUnscored = query.state.data?.transcripts?.some(
        (m: MeetingTranscript) => m.transcript_text && !m.score_data
      );
      return hasUnscored ? 5000 : false;
    },
  });

  const { data: leaderMeetings } = useQuery({
    queryKey: ["meetings", "leader"],
    queryFn: () => fetchMeetings(undefined, undefined, undefined, true),
  });

  const meetings = tab === "mine" ? myMeetings?.transcripts : leaderMeetings?.transcripts;

  // Track scored meetings to trigger celebrations
  const prevScoredRef = useRef<Set<string>>(new Set());
  const { earnXp, unlockAchievement } = useGamification();

  useEffect(() => {
    const scored = (myMeetings?.transcripts || []).filter((m) => m.score_data);
    const scoredIds = new Set(scored.map((m) => m.id));

    const newlyScored = scored.filter((m) => !prevScoredRef.current.has(m.id));
    if (newlyScored.length > 0 && prevScoredRef.current.size > 0) {
      for (const m of newlyScored) {
        earnXp("meeting_scored");
        const s = m.score_data!;
        if (s.total >= 40) unlockAchievement("score_40");
        else if (s.total >= 35) unlockAchievement("score_35");
        else if (s.total >= 30) unlockAchievement("score_30");
      }
      if (scored.length === 1) unlockAchievement("first_score");
      if (scored.length >= 5) unlockAchievement("meetings_5");
      if (scored.length >= 20) unlockAchievement("meetings_20");
    }
    prevScoredRef.current = scoredIds;
  }, [myMeetings]);

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const idx = result.indexOf(",");
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > AUDIO_MAX_BYTES) {
      setErrorMsg(
        `音声ファイルが大きすぎます (${(file.size / 1024 / 1024).toFixed(1)}MB)。${(AUDIO_MAX_BYTES / 1024 / 1024).toFixed(0)}MB 以下に分割するか、低ビットレートで再エンコードしてください。`,
      );
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setUploading(true);
    setErrorMsg(null);
    try {
      const base64 = await fileToBase64(file);
      await transcribeAudio({
        audio_base64: base64,
        mime_type: file.type || "audio/webm",
        title: titleInput || `${currentUser} 面談録音`,
        consultant_name: currentUser,
        is_leader: isLeaderUser,
        recorded_at: dateInput ? new Date(`${dateInput}T09:00:00`).toISOString() : undefined,
      });
      qc.invalidateQueries({ queryKey: ["meetings"] });
      setTitleInput("");
      // refetchInterval (5s) が自動採点の完了を拾う
    } catch (err) {
      setErrorMsg(`録音の保存に失敗しました: ${(err as Error).message}`);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleTextSave = async () => {
    if (!textInput.trim()) return;
    setUploading(true);
    setErrorMsg(null);
    try {
      await createMeeting({
        title: titleInput || `${currentUser} 面談記録`,
        transcript_text: textInput,
        consultant_name: currentUser,
        is_leader: isLeaderUser,
        source: "manual",
        recorded_at: dateInput ? new Date(`${dateInput}T09:00:00`).toISOString() : undefined,
      });
      qc.invalidateQueries({ queryKey: ["meetings"] });
      setTextInput("");
      setTitleInput("");
      setShowUpload(false);
    } catch (err) {
      setErrorMsg(`保存に失敗しました: ${(err as Error).message}`);
    }
    setUploading(false);
  };

  const handleSummarize = async (id: string) => {
    await summarizeMeeting(id);
    qc.invalidateQueries({ queryKey: ["meetings"] });
  };

  const handleRescore = async (id: string) => {
    // 通常クリック: キャッシュ尊重 (テキスト未変更なら Gemini を呼ばない)
    // Shift+クリック: 強制再生成 (Gemini を必ず呼ぶ)
    const force = (window.event as MouseEvent | undefined)?.shiftKey === true;
    await scoreMeeting(id, force);
    qc.invalidateQueries({ queryKey: ["meetings"] });
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`「${title}」を削除します。よろしいですか？\n（採点・要約・リーダーコメントも一緒に消えます）`)) return;
    try {
      await deleteMeeting(id);
      qc.invalidateQueries({ queryKey: ["meetings"] });
    } catch (err) {
      setErrorMsg(`削除に失敗しました: ${(err as Error).message}`);
    }
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

      {/* Tabs - リーダー面談タブはリーダー本人のみに表示 */}
      <div className="flex gap-1 mb-4">
        {([
          { key: "mine" as const, label: "自分の面談", count: myMeetings?.total || 0 },
          ...(isLeaderUser
            ? [{ key: "leader" as const, label: `${getLeaderNames().join("・")}（リーダー）の面談`, count: leaderMeetings?.total || 0 }]
            : []),
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
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-extrabold text-[#777] shrink-0">面談日</label>
            <input
              type="date"
              value={dateInput}
              max={todayInputValue()}
              onChange={(e) => setDateInput(e.target.value)}
              className="rounded-xl border-2 border-[#e5e5e5] px-2 py-1 text-xs font-bold text-[#4b4b4b] focus:border-duo-blue focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setDateInput(todayInputValue())}
              className="text-[10px] font-bold text-duo-blue hover:underline"
            >
              今日に戻す
            </button>
          </div>
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
            {isLeaderUser ? "👑 リーダーの面談として保存されます" : `📝 ${currentUser}の面談として保存されます`}
          </p>
          {errorMsg && (
            <div className="rounded-xl bg-duo-red/10 border border-duo-red/30 p-2.5">
              <p className="text-[11px] font-bold text-duo-red leading-snug">{errorMsg}</p>
            </div>
          )}
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
            onRescore={handleRescore}
            onDelete={handleDelete}
            isLeaderUser={isLeaderUser}
            currentUser={currentUser}
            onFeedbackSaved={() => qc.invalidateQueries({ queryKey: ["meetings"] })}
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
  onRescore,
  onDelete,
  isLeaderUser,
  currentUser,
  onFeedbackSaved,
}: {
  meeting: MeetingTranscript;
  leaderAvg: Record<string, number> | null;
  onSummarize: (id: string) => void;
  onRescore: (id: string) => Promise<void>;
  onDelete: (id: string, title: string) => Promise<void>;
  isLeaderUser: boolean;
  currentUser: string;
  onFeedbackSaved: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [fbText, setFbText] = useState("");
  const [fbSaving, setFbSaving] = useState(false);
  const [rescoring, setRescoring] = useState(false);
  const [rescoreError, setRescoreError] = useState<string | null>(null);
  const score = m.score_data;
  const canDelete = isLeaderUser || (m.consultant_name && m.consultant_name === currentUser);

  const handleRescoreClick = async () => {
    setRescoring(true);
    setRescoreError(null);
    try {
      await onRescore(m.id);
    } catch (err) {
      setRescoreError(`再採点に失敗: ${(err as Error).message}`);
    }
    setRescoring(false);
  };

  const handleFeedbackSave = async () => {
    if (!fbText.trim()) return;
    setFbSaving(true);
    try {
      await addLeaderFeedback(m.id, fbText.trim());
      setFbText("");
      onFeedbackSaved();
    } catch { /* ignore */ }
    setFbSaving(false);
  };

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
          <div className="flex gap-2 flex-wrap items-center">
            {!m.summary && (
              <button
                onClick={() => onSummarize(m.id)}
                className="btn-duo !px-3 !py-1.5 !text-[10px] !rounded-xl text-white"
                style={{ backgroundColor: "#CE82FF", borderBottomColor: "#a85fd6" }}
              >
                AI要約
              </button>
            )}
            {!score && m.transcript_text && !rescoring && (
              <button
                onClick={handleRescoreClick}
                className="flex items-center gap-1.5 text-[10px] font-extrabold text-duo-orange px-3 py-1.5 rounded-xl bg-duo-orange/10 hover:bg-duo-orange/20 transition-colors"
                title="クリック: 採点 (キャッシュ尊重) / Shift+クリック: 強制再生成"
              >
                <span className="inline-block w-2 h-2 rounded-full bg-duo-orange animate-pulse" />
                採点中... (クリックで再採点)
              </button>
            )}
            {score && m.transcript_text && (
              <button
                onClick={handleRescoreClick}
                disabled={rescoring}
                className="text-[10px] font-extrabold text-duo-blue px-3 py-1.5 rounded-xl bg-duo-blue/10 hover:bg-duo-blue/20 disabled:opacity-40 transition-colors"
              >
                {rescoring ? "再採点中..." : "再採点"}
              </button>
            )}
            {rescoring && !score && (
              <span className="text-[10px] font-bold text-duo-orange px-3 py-1.5 rounded-xl bg-duo-orange/10">
                再採点中...
              </span>
            )}
            {canDelete && (
              <button
                onClick={() => onDelete(m.id, m.title)}
                className="ml-auto text-[10px] font-extrabold text-duo-red px-3 py-1.5 rounded-xl bg-duo-red/10 hover:bg-duo-red/20 transition-colors"
              >
                削除
              </button>
            )}
          </div>

          {rescoreError && (
            <div className="rounded-xl bg-duo-red/10 border border-duo-red/30 p-2.5">
              <p className="text-[11px] font-bold text-duo-red leading-snug">{rescoreError}</p>
            </div>
          )}

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

          {/* Evidence */}
          {score?.evidence && (
            <div className="rounded-xl bg-[#fafafa] border border-[#e5e5e5] p-3 space-y-1.5">
              <div className="text-[10px] font-extrabold text-[#777] uppercase tracking-wider mb-1">採点根拠（面談からの引用）</div>
              {DIMS.map(({ key, label, color }) => {
                const ev = score.evidence?.[key as keyof typeof score.evidence];
                if (!ev) return null;
                return (
                  <div key={key} className="flex items-start gap-2">
                    <span className="text-[10px] font-bold shrink-0 w-10 mt-0.5" style={{ color }}>{label}</span>
                    <p className="text-[10px] font-bold text-[#555] leading-relaxed">「{ev}」</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Leader would */}
          {score?.leader_would && (
            <div className="rounded-xl bg-duo-purple/5 border border-duo-purple/20 p-3">
              <div className="text-[10px] font-extrabold text-duo-purple uppercase tracking-wider mb-1">リーダーならこうしてた</div>
              <p className="text-xs font-bold text-[#4b4b4b] leading-relaxed">{score.leader_would}</p>
            </div>
          )}

          {/* Key Moments Timeline (ダイジェストプレイバック) */}
          {score?.key_moments && score.key_moments.length > 0 && (
            <DigestTimeline moments={score.key_moments} />
          )}

          {/* Learning Resources (学習リソース) */}
          {score?.learning_resources && score.learning_resources.length > 0 && (
            <div className="rounded-xl bg-duo-blue/5 border border-duo-blue/20 p-3 space-y-2">
              <div className="text-[10px] font-extrabold text-duo-blue uppercase tracking-wider mb-1">弱点強化トレーニング</div>
              {score.learning_resources.map((lr, idx) => {
                const dim = DIMS.find(d => d.key === lr.axis);
                const typeIcon = lr.source_type === "video" ? "▶" : lr.source_type === "article" ? "📄" : "📖";
                const typeColor = lr.source_type === "video" ? "#FF4B4B" : lr.source_type === "article" ? "#1CB0F6" : "#CE82FF";
                return (
                  <div key={idx} className="rounded-lg bg-white border border-[#e5e5e5] overflow-hidden">
                    <div className="p-2.5">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: (dim?.color || "#777") + "20",
                            color: dim?.color || "#777",
                          }}
                        >
                          {dim?.label || lr.axis}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: typeColor + "15", color: typeColor }}>
                          {typeIcon} {lr.source_name || (lr.source_type === "video" ? "動画" : lr.source_type === "article" ? "記事" : "プレイブック")}
                        </span>
                      </div>
                      <p className="text-xs font-extrabold text-[#4b4b4b] mb-0.5">{lr.title}</p>
                      <p className="text-[10px] font-bold text-[#777] leading-relaxed">{lr.description}</p>
                    </div>
                    {lr.url ? (
                      <a
                        href={lr.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between px-2.5 py-1.5 bg-[#f7f7f7] border-t border-[#e5e5e5] hover:bg-duo-blue/10 transition-colors group"
                      >
                        <span className="text-[10px] font-extrabold text-duo-blue group-hover:underline">
                          教材を見る →
                        </span>
                        <span className="text-[9px] font-bold text-[#aaa] truncate ml-2 max-w-[180px]">
                          {lr.source_name}
                        </span>
                      </a>
                    ) : lr.playbook_situation ? (
                      <div className="px-2.5 py-1.5 bg-duo-purple/5 border-t border-duo-purple/10">
                        <span className="text-[10px] font-bold text-duo-purple">📖 {lr.playbook_situation}</span>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {/* Leader Feedback */}
          {m.leader_feedback && (
            <div className="rounded-xl bg-[#fef3c7] border border-[#fbbf24] p-3">
              <div className="text-[10px] font-extrabold text-[#92400e] uppercase tracking-wider mb-1">リーダーコメント</div>
              <p className="text-xs font-bold text-[#4b4b4b] leading-relaxed">{m.leader_feedback}</p>
            </div>
          )}

          {isLeaderUser && !m.is_leader && score && (
            <div className="rounded-xl border-2 border-dashed border-[#fbbf24] p-3 space-y-2">
              <div className="text-[10px] font-extrabold text-[#92400e] uppercase tracking-wider">
                {m.leader_feedback ? "コメントを更新" : "リーダーコメントを追加"}
              </div>
              <textarea
                value={fbText}
                onChange={(e) => setFbText(e.target.value)}
                placeholder="この面談へのアドバイスやフィードバックを入力..."
                className="w-full rounded-xl border-2 border-[#e5e5e5] px-3 py-2 text-xs font-bold text-[#4b4b4b] h-16 focus:border-[#fbbf24] focus:outline-none resize-none"
              />
              <button
                onClick={handleFeedbackSave}
                disabled={!fbText.trim() || fbSaving}
                className="btn-duo !px-4 !py-1.5 !text-[10px] text-white disabled:opacity-40"
                style={{ backgroundColor: "#f59e0b", borderBottomColor: "#d97706" }}
              >
                {fbSaving ? "保存中..." : "コメント保存"}
              </button>
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

function DigestTimeline({ moments }: { moments: KeyMoment[] }) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const hasTimestamps = moments.some((m) => m.seconds != null);
  const maxSec = hasTimestamps ? Math.max(...moments.filter((m) => m.seconds != null).map((m) => m.seconds!), 1) : 0;

  const handleDotClick = (idx: number) => {
    setSelectedIdx(idx === selectedIdx ? null : idx);
    const el = listRef.current?.querySelector(`[data-moment="${idx}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  return (
    <div className="rounded-xl bg-[#fffbeb] border border-[#fde68a] p-3 space-y-2">
      <div className="text-[10px] font-extrabold text-[#92400e] uppercase tracking-wider">
        面談ダイジェスト・プレイバック
      </div>

      {/* Timeline bar */}
      {hasTimestamps && (
        <div className="relative">
          <div className="flex items-center justify-between text-[9px] font-bold text-[#aaa] mb-1">
            <span>0:00</span>
            <span>{Math.floor(maxSec / 60)}:{String(maxSec % 60).padStart(2, "0")}</span>
          </div>
          <div className="relative h-6 bg-[#fef3c7] rounded-full border border-[#fde68a]">
            {moments.filter((m) => m.seconds != null).map((m, idx) => {
              const origIdx = moments.indexOf(m);
              const left = (m.seconds! / maxSec) * 100;
              const dim = DIMS.find((d) => d.key === m.axis);
              const isActive = selectedIdx === origIdx;
              return (
                <button
                  key={idx}
                  onClick={() => handleDotClick(origIdx)}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-200"
                  style={{ left: `${Math.min(Math.max(left, 3), 97)}%` }}
                  title={`${m.timestamp || ""} ${m.axis_label}`}
                >
                  <div
                    className="rounded-full border-2 border-white transition-all"
                    style={{
                      width: isActive ? 14 : 10,
                      height: isActive ? 14 : 10,
                      backgroundColor: dim?.color || "#999",
                      boxShadow: isActive ? `0 0 0 3px ${dim?.color}40` : "0 1px 2px rgba(0,0,0,0.2)",
                    }}
                  />
                </button>
              );
            })}
          </div>
          {/* Axis legend */}
          <div className="flex gap-2 mt-1.5 justify-center flex-wrap">
            {DIMS.map(({ key, label, color }) => {
              const count = moments.filter((m) => m.axis === key).length;
              if (count === 0) return null;
              return (
                <span key={key} className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-[9px] font-bold text-[#777]">{label}({count})</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Moment list */}
      <div ref={listRef} className="space-y-1.5 max-h-48 overflow-y-auto">
        {moments.map((km, idx) => {
          const dim = DIMS.find((d) => d.key === km.axis);
          const isActive = selectedIdx === idx;
          return (
            <div
              key={idx}
              data-moment={idx}
              onClick={() => setSelectedIdx(idx === selectedIdx ? null : idx)}
              className={`flex items-start gap-2 p-1.5 rounded-lg cursor-pointer transition-all ${
                isActive ? "bg-white border border-[#fbbf24] shadow-sm" : "hover:bg-[#fef9e7]"
              }`}
            >
              {km.timestamp && (
                <span className="text-[10px] font-black text-[#92400e] shrink-0 w-11 tabular-nums">
                  {km.timestamp}
                </span>
              )}
              <span
                className="text-[10px] font-bold shrink-0 px-1.5 py-0.5 rounded"
                style={{ backgroundColor: (dim?.color || "#777") + "20", color: dim?.color || "#777" }}
              >
                {km.axis_label}
              </span>
              <div className="flex-1 min-w-0">
                {km.speaker && (
                  <span className="text-[10px] font-extrabold text-[#4b4b4b] mr-1">{km.speaker}:</span>
                )}
                <span className="text-[10px] font-bold text-[#555] leading-relaxed">「{km.text}」</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
