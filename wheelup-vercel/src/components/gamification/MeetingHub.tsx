import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { useGamification } from "../../gamification/GamificationProvider";
import { isLeader as isLeaderRole, TEAM_MEMBERS } from "../../lib/team";
import LearningModal from "./LearningModal";
import TalkTendencyPanel from "./TalkTendencyPanel";
import { analyzeTalk, talkStatsToCsvRow, rowsToCsv } from "../../lib/talkAnalysis";
import {
  fetchMeetings,
  createMeeting,
  summarizeMeeting,
  addLeaderFeedback,
  calibrateMeeting,
  addManualObservation,
  removeManualObservation,
  bulkRescore,
  autoCalibrate,
  fetchTrainingHealth,
  type TrainingHealth,
  scoreMeeting,
  diagnoseMeeting,
  bulkDiagnoseMine,
  bulkDiagnoseLeader,
  manualScoreMeeting,
  saveMeetingOutcome,
  deleteMeeting,
  type MeetingTranscript,
  type MeetingScore,
  type KeyMoment,
} from "../../api/client";

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const todayInputValue = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

export default function MeetingHub() {
  const { currentUser } = useGamification();
  const qc = useQueryClient();
  // 西村 FB 2026-07-18: 階級性をやめ、全メンバーの面談に共通アクセスできるタブ構造に。
  // タブ = メンバー名（誰でも誰のタブも開ける）。初期タブは自分。
  const [tab, setTab] = useState<string>(currentUser || TEAM_MEMBERS[0].name);
  const [uploading, setUploading] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [dateInput, setDateInput] = useState<string>(todayInputValue);
  const [showUpload, setShowUpload] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isLeaderUser = isLeaderRole(currentUser);

  // 採点は手動 (ユーザー操作) になったので自動 refetch は廃止。
  // 採点完了時に handleRescore 内で invalidateQueries しているのでそれで十分。
  // 全メンバーの面談を一括取得し、タブ（担当者）でクライアント側に絞り込む。
  const { data: allMeetings } = useQuery({
    queryKey: ["meetings", "all"],
    queryFn: () => fetchMeetings(),
    enabled: !!currentUser,
  });

  // 担当者ごとにグルーピング（タブの件数バッジ用）
  const byMember = useMemo(() => {
    const map = new Map<string, MeetingTranscript[]>();
    for (const m of allMeetings?.transcripts || []) {
      const key = m.consultant_name || "未設定";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return map;
  }, [allMeetings]);

  const meetings = byMember.get(tab) || [];
  // 自分の面談（一括整形/再採点などの自分向け操作に使う）
  const myMeetings = useMemo(
    () => ({ transcripts: byMember.get(currentUser || "") || [] }),
    [byMember, currentUser],
  );
  const leaderMeetings = useMemo(
    () => ({ transcripts: (allMeetings?.transcripts || []).filter((m) => m.is_leader) }),
    [allMeetings],
  );

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

  // 採点中の面談ID。null なら誰も採点していない。1 件ずつ採点する制約をフロントで強制する。
  const [scoringId, setScoringId] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  // 全件再採点 (リーダー専用) の進捗
  const [bulkRescoreState, setBulkRescoreState] = useState<{ running: boolean; done: number; total: number; lastError?: string } | null>(null);
  // 自動校正の結果メッセージ
  const [autoCalState, setAutoCalState] = useState<{ running: boolean; message?: string } | null>(null);

  // 学習データ健全性 (リーダー専用パネル) ── ゴールド観察ライブラリの軸別カバレッジ可視化
  const [trainingHealth, setTrainingHealth] = useState<TrainingHealth | null>(null);
  const refreshTrainingHealth = useCallback(async () => {
    try {
      setTrainingHealth(await fetchTrainingHealth());
    } catch { /* table 未マイグレーション or 権限なしなら静かにスキップ */ }
  }, []);
  useEffect(() => {
    if (isLeaderRole(currentUser)) {
      void refreshTrainingHealth();
    }
  }, [currentUser, refreshTrainingHealth]);
  // Gemini クォータ枯渇 / 過負荷を検出した場合に UI に持続表示するためのフラグ。
  const [aiUnavailable, setAiUnavailable] = useState<null | "quota" | "overloaded">(null);

  const handleRescore = async (id: string, consultantName?: string | null) => {
    if (scoringId) return; // 他の採点中はクリック無視 (運用面のクォータ保護)
    // 「再採点」は明示操作なので常に強制再生成する。
    //   - 議事録テキストが同じでも採点ロジック (話者分離・観察抽出等) が更新されている
    //     ことがあり、キャッシュを返すと「ボタンを押しても変わらない」状態になるため。
    //   - 連打は scoringId ガード + サーバ側レート制限 (6/分) で保護済み。
    const force = true;
    setScoringId(id);
    try {
      // 安藤・村上からの FB「2 人体制の面談で本人だけ採点できているか不安」への対応:
      // consultantName を target_speaker として渡し、同席者 (小林) の発言を必ず除外する。
      // 発話者ラベルが議事録に無い場合は API 側でフラグを返し、UI で警告表示する (沈黙のフォールバック禁止)。
      const targetSpeaker = consultantName || null;
      await scoreMeeting(id, { force, targetSpeaker });
      setAiUnavailable(null); // 成功したらバナー解除
      qc.invalidateQueries({ queryKey: ["meetings"] });
    } catch (err) {
      const msg = (err as Error).message || "";
      if (msg.includes("クォータ") || msg.includes("429") || msg.includes("quota")) setAiUnavailable("quota");
      else if (msg.includes("混雑") || msg.includes("503") || msg.includes("UNAVAILABLE")) setAiUnavailable("overloaded");
      throw err; // 既存のエラー表示は維持
    } finally {
      setScoringId(null);
    }
  };

  // リーダー面談を順次再採点。RPM 上限を踏まえ 5 秒間隔で実行 (15 RPM の安全マージン)。
  const bulkRescoreLeader = async (ids: string[]) => {
    if (scoringId || bulkProgress) return;
    setBulkProgress({ done: 0, total: ids.length });
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      setScoringId(id);
      try {
        await scoreMeeting(id, { force: false });
      } catch (err) {
        console.error(`bulk rescore ${id} failed:`, err);
      }
      setScoringId(null);
      setBulkProgress({ done: i + 1, total: ids.length });
      qc.invalidateQueries({ queryKey: ["meetings"] });
      // 次の採点まで 5 秒待つ (Gemini RPM 保護)
      if (i < ids.length - 1) await new Promise((r) => setTimeout(r, 5000));
    }
    setBulkProgress(null);
  };

  // 自分の全面談を新ロジックで強制再採点。
  // 西村 FB「全ての面談で (話者分離/プレイバック等の) 新機能が反映されるように」対応。
  // 各面談を force=true + 本人名 (= 議事録の「あなた」) で再採点し、古いキャッシュを一掃する。
  const bulkRescoreMine = async () => {
    if (scoringId || bulkProgress) return;
    const targets = (myMeetings?.transcripts || []).filter((m) => m.transcript_text);
    if (targets.length === 0) return;
    if (!window.confirm(`自分の面談 ${targets.length} 件を新ロジックで再採点します。\n話者分離 (あなた=本人) と軸別フィードバックが全面談に反映されます。\n数分かかります。よろしいですか？`)) return;
    setBulkProgress({ done: 0, total: targets.length });
    for (let i = 0; i < targets.length; i++) {
      const mt = targets[i];
      setScoringId(mt.id);
      try {
        await scoreMeeting(mt.id, { force: true, targetSpeaker: mt.consultant_name || currentUser || null });
      } catch (err) {
        console.error(`bulk rescore mine ${mt.id} failed:`, err);
      }
      setScoringId(null);
      setBulkProgress({ done: i + 1, total: targets.length });
      qc.invalidateQueries({ queryKey: ["meetings"] });
      if (i < targets.length - 1) await new Promise((r) => setTimeout(r, 5000));
    }
    setBulkProgress(null);
  };

  // 全件再採点 (新ロジックで全議事録を更新): 4 件ずつ has_more=false までループ。
  // リーダーがクリックすると、画面表示中のスコアが全部新ロジックに統一される。
  const runBulkRescoreAll = async () => {
    if (bulkRescoreState?.running) return;
    if (!window.confirm("画面に表示中の全議事録 (メンバー分) を新ロジックで再採点します。1 件あたり 15-20 秒、合計数分かかります。続行しますか？")) return;
    let offset = 0;
    let done = 0;
    let total = 0;
    setBulkRescoreState({ running: true, done: 0, total: 0 });
    try {
      while (true) {
        const r = await bulkRescore({ offset, limit: 4, force: true, include_leader: false });
        done += r.processed;
        total = r.total_in_db;
        setBulkRescoreState({ running: true, done, total });
        qc.invalidateQueries({ queryKey: ["meetings"] });
        if (!r.has_more) break;
        offset = r.next_offset;
        await new Promise((res) => setTimeout(res, 2000)); // バッチ間も 2 秒
      }
      setBulkRescoreState({ running: false, done, total, lastError: undefined });
    } catch (e) {
      setBulkRescoreState({ running: false, done, total, lastError: (e as Error).message });
    }
  };

  // 自動校正: リーダー面談から良/悪アンカーを自動登録
  const runAutoCalibrate = async () => {
    if (autoCalState?.running) return;
    setAutoCalState({ running: true });
    try {
      const r = await autoCalibrate({ top: 3, bottom: 2, overwrite: false });
      const msg = `✅ 良いアンカー ${r.good_count} 件 / 悪いアンカー ${r.bad_count} 件 を自動登録しました (スコア範囲: ${r.score_range.lowest}-${r.score_range.highest})`;
      setAutoCalState({ running: false, message: msg });
      qc.invalidateQueries({ queryKey: ["meetings"] });
    } catch (e) {
      setAutoCalState({ running: false, message: `❌ ${(e as Error).message}` });
    }
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
          {/* Gemini 利用可否バッジ */}
          {aiUnavailable === "quota" && (
            <span className="text-[9px] font-extrabold text-duo-red px-2 py-0.5 rounded-full bg-duo-red/10 border border-duo-red/30" title="Gemini 無料枠枯渇。明日 17 時頃にリセット予定。小林の手動採点は使えます">
              🔋 AI 採点休止中
            </span>
          )}
          {aiUnavailable === "overloaded" && (
            <span className="text-[9px] font-extrabold text-duo-orange px-2 py-0.5 rounded-full bg-duo-orange/10 border border-duo-orange/30" title="Gemini 過負荷。数分で復旧見込み">
              ⏳ AI 一時的に混雑
            </span>
          )}
        </div>
        {/* 面談の追加は「自分のタブ」でのみ（他人の面談は本人が投入する） */}
        {tab === currentUser && (
          <button
            onClick={() => setShowUpload(!showUpload)}
            className="btn-duo btn-duo-green !px-3 !py-1.5 !text-[10px]"
          >
            + 面談を追加
          </button>
        )}
      </div>

      {/* メンバータブ（西村FB 2026-07-18: 階級性をやめ、誰でも誰の面談も閲覧・FB入力できる） */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {TEAM_MEMBERS.map((mem) => {
          const list = byMember.get(mem.name) || [];
          const active = tab === mem.name;
          return (
            <button
              key={mem.name}
              onClick={() => setTab(mem.name)}
              className={`shrink-0 px-3 py-2 rounded-xl text-xs font-extrabold transition-colors flex items-center gap-1.5 ${
                active ? "text-white" : "text-[#8a8a8a] hover:bg-[#f2f4f7]"
              }`}
              style={active ? { backgroundColor: mem.color } : undefined}
            >
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-black"
                style={active
                  ? { backgroundColor: "rgba(255,255,255,.25)", color: "#fff" }
                  : { backgroundColor: mem.color + "22", color: mem.color }}
              >
                {mem.name.slice(0, 1)}
              </span>
              {mem.name}
              {mem.name === currentUser && <span className="text-[9px] opacity-80">(自分)</span>}
              <span className={`text-[10px] tabular-nums ${active ? "opacity-90" : "opacity-60"}`}>{list.length}</span>
            </button>
          );
        })}
      </div>

      {/* 他メンバーのタブを見ている時の案内 */}
      {tab !== currentUser && (
        <div className="mb-3 rounded-xl bg-[#F3F5F8] border border-[#E2E6EC] px-3 py-2">
          <p className="text-[11px] font-bold text-[#555]">
            👀 <b>{tab}</b>さんの面談を閲覧中です。トーク傾向の確認と、フィードバック（注釈）の入力ができます。
          </p>
        </div>
      )}

      {/* 📊 トーク傾向を CSV エクスポート (西村FB: 振り返り・特性分析用) */}
      {(meetings?.length ?? 0) > 0 && (
        <div className="mb-3 rounded-2xl border-2 border-slate-300 bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1">
              <p className="text-xs font-extrabold text-[#4b4b4b]">📊 トーク傾向を CSV 出力</p>
              <p className="text-[10px] font-bold text-[#777] mt-0.5">
                表示中の面談を機械分析（発話比率・質問数・口癖・発話速度など）し、CSV でダウンロードします。振り返り・特性分析に。
              </p>
            </div>
            <button
              onClick={() => {
                const rows = (meetings || [])
                  .filter((mt) => mt.transcript_text)
                  .map((mt) => {
                    const s = analyzeTalk(mt.transcript_text || "", mt.consultant_name || currentUser || "あなた");
                    if (!s) return null;
                    return talkStatsToCsvRow({
                      date: (mt.recorded_at || "").slice(0, 10),
                      title: mt.title || "",
                      consultant: mt.consultant_name || currentUser || "",
                    }, s);
                  })
                  .filter((r): r is Record<string, string | number> => !!r);
                if (rows.length === 0) { window.alert("分析できる議事録がありません（話者ラベル付きが必要）"); return; }
                const csv = rowsToCsv(rows);
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `talk_tendency_${new Date().toISOString().slice(0,10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="btn-duo !px-4 !py-2 !text-[11px] shrink-0 text-white"
              style={{ backgroundColor: "#64748B", borderBottomColor: "#475569" }}
            >⬇ CSV 出力</button>
          </div>
        </div>
      )}

      {/* メンバー: 自分の全面談を一括整形 (01プロンプトでお手本と同じフォーマットに揃える) */}
      {!isLeaderUser && (myMeetings?.transcripts?.length ?? 0) > 0 && (
        <div className="mb-3 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1">
              <p className="text-xs font-extrabold text-[#4b4b4b]">📋 自分の全面談を整形（01候補者情報フォーマット）</p>
              <p className="text-[10px] font-bold text-[#777] mt-0.5">
                各議事録を「選考状況 / NA / 自己進捗度 / キャリア納得度感 / グリップ角度」の5項目に整形します。
                小林面談と同じフォーマットに揃えるので、再採点時に項目ごとに直接比較されます。1件 ~15 秒。
              </p>
            </div>
            <button
              onClick={async () => {
                if (!window.confirm("自分の未整形の面談を一括で整形します（1バッチ3件ずつループ）。よろしいですか？")) return;
                let totalOk = 0, totalProcessed = 0;
                try {
                  while (true) {
                    const r = await bulkDiagnoseMine();
                    totalOk += r.succeeded;
                    totalProcessed += r.processed;
                    qc.invalidateQueries({ queryKey: ["meetings"] });
                    if (!r.has_more) break;
                    await new Promise((res) => setTimeout(res, 2000));
                  }
                  window.alert(`✅ 整形完了: 成功 ${totalOk} / 処理 ${totalProcessed} 件`);
                } catch (e) { window.alert(`❌ ${(e as Error).message}（処理済 ${totalOk} 件）`); }
              }}
              className="btn-duo !px-4 !py-2 !text-[11px] shrink-0 text-white"
              style={{ backgroundColor: "#10B981", borderBottomColor: "#059669" }}
            >📋 全件整形</button>
          </div>
        </div>
      )}

      {/* メンバー: 自分の全面談を新ロジックで再採点 (西村FB「全面談に新機能を反映」) */}
      {!isLeaderUser && (myMeetings?.transcripts?.length ?? 0) > 0 && (
        <div className="mb-4 rounded-2xl border-2 border-duo-blue bg-duo-blue/5 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1">
              <p className="text-xs font-extrabold text-[#4b4b4b]">🔄 自分の全面談を再採点（新ロジック）</p>
              <p className="text-[10px] font-bold text-[#777] mt-0.5">
                話者分離と軸別フィードバックを全面談に反映。整形済みの面談は「小林の5項目」と直接比較されます。
              </p>
            </div>
            <button
              onClick={bulkRescoreMine}
              disabled={!!scoringId || !!bulkProgress}
              className="btn-duo !px-4 !py-2 !text-[11px] shrink-0 text-white disabled:opacity-40"
              style={{ backgroundColor: "#1CB0F6", borderBottomColor: "#1899D6" }}
            >
              {bulkProgress ? `${bulkProgress.done} / ${bulkProgress.total} 採点中…` : "🔄 全件再採点"}
            </button>
          </div>
        </div>
      )}

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
          <div>
            <textarea
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="議事録テキストを貼り付け..."
              className="w-full rounded-xl border-2 border-[#e5e5e5] px-3 py-2 text-xs font-bold text-[#4b4b4b] h-32 focus:border-duo-blue focus:outline-none resize-none"
            />
            <button
              onClick={handleTextSave}
              disabled={!textInput.trim() || uploading}
              className="btn-duo btn-duo-blue !px-4 !py-2 !text-xs mt-2 w-full disabled:opacity-40"
            >
              {uploading ? "保存中..." : "テキスト保存"}
            </button>
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

      {/* 精度向上ツール (リーダーのみ・普段は畳んでおく) */}
      {isLeaderUser && (
        <details className="mb-3 rounded-2xl border-2 border-purple-300 bg-purple-50 p-3">
          <summary className="text-xs font-extrabold text-purple-800 cursor-pointer select-none">
            ⚙️ 採点エンジンの設定（普段は触らなくて OK・クリックで開く）
          </summary>
          <div className="space-y-2 mt-3 pt-3 border-t border-purple-200">

          {/* 自動校正 */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1">
              <p className="text-[11px] font-extrabold text-[#4b4b4b]">① リーダー面談から自動でアンカー登録</p>
              <p className="text-[10px] font-bold text-[#777] mt-0.5">
                リーダー面談のうちスコア上位 3 件を「良いアンカー」、下位 2 件を「悪いアンカー」として自動登録。
                校正アンカーが 0 件の状態を即座に解消し、AI 採点の基準を立ち上げます。
                (既に手動マーク済みの面談は上書きしません)
              </p>
            </div>
            <button
              onClick={runAutoCalibrate}
              disabled={autoCalState?.running}
              className="shrink-0 text-[11px] font-extrabold px-3 py-2 rounded-xl bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40"
            >
              {autoCalState?.running ? "実行中..." : "🎯 自動校正"}
            </button>
          </div>
          {autoCalState?.message && (
            <div className="text-[10px] font-bold text-purple-700 bg-white border border-purple-200 rounded-lg px-2 py-1">
              {autoCalState.message}
            </div>
          )}

          {/* 小林面談を一括整形 (お手本データを揃える) */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-purple-200">
            <div className="flex-1">
              <p className="text-[11px] font-extrabold text-[#4b4b4b]">📋 小林面談を一括整形（お手本5項目を整備）</p>
              <p className="text-[10px] font-bold text-[#777] mt-0.5">
                小林さんの面談を 01 候補者情報フォーマット(5項目)に整形します。
                メンバー面談との「同フォーマット比較」のお手本になります。最初に1回実行してください。
              </p>
            </div>
            <button
              onClick={async () => {
                if (!window.confirm("小林面談を一括で整形します（1バッチ3件ずつループ・未整形分のみ）。よろしいですか？")) return;
                let totalOk = 0, totalProcessed = 0;
                try {
                  while (true) {
                    const r = await bulkDiagnoseLeader();
                    totalOk += r.succeeded;
                    totalProcessed += r.processed;
                    qc.invalidateQueries({ queryKey: ["meetings"] });
                    if (!r.has_more) break;
                    await new Promise((res) => setTimeout(res, 2000));
                  }
                  window.alert(`✅ 整形完了: 成功 ${totalOk} / 処理 ${totalProcessed} 件`);
                } catch (e) { window.alert(`❌ ${(e as Error).message}（処理済 ${totalOk} 件）`); }
              }}
              className="shrink-0 text-[11px] font-extrabold px-3 py-2 rounded-xl text-white"
              style={{ backgroundColor: "#10B981", borderBottom: "2px solid #059669" }}
            >📋 整形実行</button>
          </div>

          {/* 全件再採点 */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-purple-200">
            <div className="flex-1">
              <p className="text-[11px] font-extrabold text-[#4b4b4b]">② メンバー面談を全件再採点 (新ロジック)</p>
              <p className="text-[10px] font-bold text-[#777] mt-0.5">
                旧採点が残っている議事録を、新採点ロジック (話者フィルタ + 校正アンカー + 印象点排除) で
                上書きします。画面に表示中の全スコアが最新化されます。数分かかります。
              </p>
            </div>
            <button
              onClick={runBulkRescoreAll}
              disabled={bulkRescoreState?.running}
              className="shrink-0 text-[11px] font-extrabold px-3 py-2 rounded-xl bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40"
            >
              {bulkRescoreState?.running ? `実行中 ${bulkRescoreState.done}/${bulkRescoreState.total}` : "♻️ 全件再採点"}
            </button>
          </div>
          {bulkRescoreState && !bulkRescoreState.running && bulkRescoreState.done > 0 && (
            <div className="text-[10px] font-bold text-purple-700 bg-white border border-purple-200 rounded-lg px-2 py-1">
              ✅ 完了: {bulkRescoreState.done}/{bulkRescoreState.total} 件を再採点しました
              {bulkRescoreState.lastError && <span className="block text-red-600 mt-1">エラー: {bulkRescoreState.lastError}</span>}
            </div>
          )}

          {/* ③ 学習データ健全性 (ゴールド観察ライブラリの軸別カバレッジ可視化) */}
          {trainingHealth && (
            <div className="pt-2 border-t border-purple-200">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex-1">
                  <p className="text-[11px] font-extrabold text-[#4b4b4b]">③ 各項目の「お手本」の量</p>
                  <p className="text-[10px] font-bold text-[#777] mt-0.5">
                    {trainingHealth.summary.total_strong + trainingHealth.summary.total_weak === 0
                      ? "まだ新ロジックで採点した面談が無いため、お手本データが空です。上の「② 全件再採点」か、面談を開いて採点を実行すると、各項目のお手本が貯まります。"
                      : "各項目のお手本の数を表示します。「薄い」項目はお手本が少なく採点がブレやすいので、その項目が目立つ面談を 1 件 👍/👎 でマークしてください。"}
                  </p>
                </div>
                <button
                  onClick={() => void refreshTrainingHealth()}
                  className="shrink-0 text-[10px] font-extrabold px-2 py-1.5 rounded-lg bg-white border border-purple-300 text-purple-700 hover:bg-purple-100"
                  title="再読込"
                >🔄</button>
              </div>
              <div className="grid grid-cols-5 gap-1 mt-1.5">
                {trainingHealth.axes.map((a) => {
                  const label = { needs: "ニーズ", proposal: "提案", trust: "信頼", closing: "前進", intel: "情報" }[a.axis];
                  const bg = a.status === "good" ? "bg-green-100 border-green-400" : a.status === "fair" ? "bg-amber-100 border-amber-400" : "bg-red-100 border-red-400";
                  const fg = a.status === "good" ? "text-green-800" : a.status === "fair" ? "text-amber-800" : "text-red-800";
                  return (
                    <div key={a.axis} className={`rounded-lg border-2 p-1.5 text-center ${bg}`}>
                      <div className={`text-[10px] font-extrabold ${fg}`}>{label}</div>
                      <div className="text-[10px] font-bold text-[#4b4b4b] tabular-nums mt-0.5">
                        ◎ {a.strong} / △ {a.weak}
                      </div>
                      <div className={`text-[9px] font-extrabold ${fg} mt-0.5`}>
                        {a.status === "good" ? "充実" : a.status === "fair" ? "標準" : "薄い"}
                      </div>
                    </div>
                  );
                })}
              </div>
              {trainingHealth.suggestions.length > 0 && trainingHealth.summary.total_strong + trainingHealth.summary.total_weak > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {trainingHealth.suggestions.map((s, idx) => (
                    <li key={idx} className="text-[10px] font-bold text-purple-800 leading-relaxed">・ {s}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          </div>
        </details>
      )}

      {/* リーダータブで小林本人がいる時、生データ再シードボタン (1 回限りの管理操作・普段は畳む) */}
      {isLeaderUser && tab === currentUser && (
        <details className="mb-3 rounded-2xl border-2 border-dashed border-[#cc7800] bg-[#fff7ed] p-3">
          <summary className="text-[11px] font-extrabold text-[#cc7800] cursor-pointer select-none">
            ⚙️ 管理操作（リーダー面談の再シード・通常は使いません）
          </summary>
          <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-[#f0d9b0]">
            <div>
              <p className="text-xs font-extrabold text-[#4b4b4b]">リーダー面談 15 件を再シード</p>
              <p className="text-[10px] font-bold text-[#777] mt-0.5">
                既存のリーダー面談を全削除して、アップロード済みの 15 件で置き換えます (1 回限りの管理操作)。
              </p>
            </div>
            <button
              onClick={async () => {
                if (!window.confirm("既存のリーダー面談を全削除して 15 件で置き換えます。よろしいですか？")) return;
                try {
                  const res = await fetch("/api/meetings/reseed-leader", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "X-User-Name": encodeURIComponent(currentUser || ""),
                    },
                  });
                  const json = await res.json();
                  if (!res.ok) throw new Error(json.error || `${res.status}`);
                  window.alert(`再シード完了: 削除 ${json.deleted} 件 / 投入 ${json.inserted} 件`);
                  qc.invalidateQueries({ queryKey: ["meetings"] });
                } catch (err) {
                  window.alert(`再シード失敗: ${(err as Error).message}`);
                }
              }}
              className="btn-duo !px-3 !py-2 !text-[10px] shrink-0 text-white"
              style={{ backgroundColor: "#cc7800", borderBottomColor: "#a55f00" }}
            >
              再シード実行
            </button>
          </div>
        </details>
      )}

      {/* リーダータブで小林本人がいる時、未採点のリーダー面談を一括採点するボタン */}
      {isLeaderUser && tab === currentUser && (() => {
        const unscored = (leaderMeetings?.transcripts || []).filter(
          (m) => m.transcript_text && !m.score_data,
        );
        if (unscored.length === 0) return null;
        return (
          <div className="mb-3 rounded-2xl border-2 border-duo-orange bg-duo-orange/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-extrabold text-[#4b4b4b]">
                  👑 未採点のリーダー面談 {unscored.length} 件
                </p>
                <p className="text-[10px] font-bold text-[#777] mt-0.5">
                  AI 採点してチームの教師データを整えます (1 件 ~20 秒、合計 {Math.ceil(unscored.length * 25 / 60)} 分目安)
                </p>
              </div>
              <button
                onClick={() => bulkRescoreLeader(unscored.map((m) => m.id))}
                disabled={!!scoringId}
                className="btn-duo !px-4 !py-2 !text-[11px] shrink-0 text-white disabled:opacity-40"
                style={{ backgroundColor: "#FF9600", borderBottomColor: "#cc7800" }}
              >
                {bulkProgress
                  ? `${bulkProgress.done} / ${bulkProgress.total} 採点中...`
                  : "一括採点する"}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Meeting list */}
      <div className="space-y-3">
        {(!meetings || meetings.length === 0) && (
          <div className="rounded-2xl bg-[#f7f7f7] p-6 text-center">
            <span className="text-3xl block mb-2">📝</span>
            <p className="text-sm font-bold text-[#777]">
              {tab === currentUser
                ? "面談を追加すると、トーク傾向が自動で分析されます"
                : `${tab}さんの面談はまだ登録されていません`}
            </p>
          </div>
        )}

        {groupByDate(meetings || []).map((group) => (
          <div key={group.dateKey} className="space-y-3">
            {/* 日付ヘッダー (Mimo 風の日付区切り) */}
            <div className="sticky top-0 z-10 bg-[#f0f4ff] px-3 py-1.5 rounded-lg">
              <span className="text-[11px] font-extrabold text-[#4b6bff]">{group.dateLabel}</span>
              <span className="text-[10px] font-bold text-[#aaa] ml-2">{group.items.length} 件</span>
            </div>
            {group.items.map((m: MeetingTranscript) => (
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
            isScoringThis={scoringId === m.id}
            isScoringOther={scoringId !== null && scoringId !== m.id}
          />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// 面談を日付ごとにグループ化 (新しい日付が上)。Mimo 風の日付区切り表示用。
function groupByDate(meetings: MeetingTranscript[]): Array<{ dateKey: string; dateLabel: string; items: MeetingTranscript[] }> {
  const sorted = [...meetings].sort(
    (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime(),
  );
  const groups = new Map<string, MeetingTranscript[]>();
  for (const m of sorted) {
    const d = new Date(m.recorded_at);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return [...groups.entries()].map(([dateKey, items]) => {
    const d = new Date(items[0].recorded_at);
    return {
      dateKey,
      dateLabel: `${d.getMonth() + 1}月${d.getDate()}日(${weekdays[d.getDay()]})`,
      items,
    };
  });
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
  isScoringThis,
  isScoringOther,
}: {
  meeting: MeetingTranscript;
  leaderAvg: Record<string, number> | null;
  onSummarize: (id: string) => void;
  onRescore: (id: string, consultantName?: string | null) => Promise<void>;
  onDelete: (id: string, title: string) => Promise<void>;
  isLeaderUser: boolean;
  currentUser: string;
  onFeedbackSaved: () => void;
  isScoringThis: boolean;
  isScoringOther: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [fbText, setFbText] = useState("");
  const [fbSaving, setFbSaving] = useState(false);
  // リーダー校正 (採点アンカー) UI 状態
  const [calComment, setCalComment] = useState(m.calibration?.comment ?? "");
  const [calSaving, setCalSaving] = useState<"good" | "bad" | "clear" | null>(null);
  const [rescoreError, setRescoreError] = useState<string | null>(null);
  const [highlightedTranscript, setHighlightedTranscript] = useState<string>("");
  const [manualOpen, setManualOpen] = useState(false);
  const [learnAxis, setLearnAxis] = useState<"needs" | "proposal" | "trust" | "closing" | "intel" | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagOpen, setDiagOpen] = useState(false);
  // 「なぜこの点数か」から「プレイバック」へジャンプするための参照
  const playbackRef = useRef<HTMLDivElement | null>(null);
  const scrollToPlayback = () => playbackRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const qc = useQueryClient();
  // 手動アノテーション (議事録に「これは strong/weak」とタグ付け・西村FB 2026-06-06 対応)
  const [annotOpen, setAnnotOpen] = useState(false);
  const [annotQuote, setAnnotQuote] = useState("");
  const [annotAxis, setAnnotAxis] = useState<"needs" | "proposal" | "trust" | "closing" | "intel">("needs");
  const [annotAssessment, setAnnotAssessment] = useState<"strong" | "weak">("strong");
  const [annotPhase, setAnnotPhase] = useState<"opening" | "hearing" | "proposal" | "closing" | "wrap">("hearing");
  const [annotWhy, setAnnotWhy] = useState("");
  const [annotNextMove, setAnnotNextMove] = useState("");
  const [annotSaving, setAnnotSaving] = useState(false);
  const [annotError, setAnnotError] = useState<string | null>(null);
  const transcriptDetailsRef = useRef<HTMLDetailsElement>(null);
  const transcriptPreRef = useRef<HTMLPreElement>(null);
  const rescoring = isScoringThis;
  const score = m.score_data;
  const canDelete = isLeaderUser || (m.consultant_name && m.consultant_name === currentUser);

  // キーモーメントクリック時の議事録ジャンプ。details を開き、該当テキストを <mark> で囲んでスクロール。
  const jumpToTranscript = (snippet: string, fullText: string) => {
    const cleanSnippet = snippet.replace(/^「|」$/g, "").trim();
    if (!cleanSnippet) return;
    // 議事録から該当箇所を探す (40字までで部分一致)
    const probe = cleanSnippet.slice(0, 40);
    const idx = fullText.indexOf(probe);
    if (idx < 0) {
      // 完全一致しなくても details だけ開く
      if (transcriptDetailsRef.current) transcriptDetailsRef.current.open = true;
      setHighlightedTranscript(escapeHtml(fullText));
      return;
    }
    const before = escapeHtml(fullText.slice(0, idx));
    const matched = escapeHtml(fullText.slice(idx, idx + cleanSnippet.length));
    const after = escapeHtml(fullText.slice(idx + cleanSnippet.length));
    setHighlightedTranscript(`${before}<mark id="km-jump" style="background:#fde68a;padding:1px 2px;border-radius:3px;">${matched}</mark>${after}`);
    if (transcriptDetailsRef.current) transcriptDetailsRef.current.open = true;
    // 次のフレームでスクロール (DOM 更新後)
    requestAnimationFrame(() => {
      const mark = transcriptPreRef.current?.querySelector("#km-jump");
      mark?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const handleRescoreClick = async () => {
    if (isScoringOther) return;
    setRescoreError(null);
    try {
      // 担当 CA を target_speaker として渡す (同席者発言の混入を防ぐ)
      await onRescore(m.id, m.consultant_name);
    } catch (err) {
      setRescoreError(`採点に失敗: ${(err as Error).message}`);
    }
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

  // リーダー校正の保存。quality=null で解除。
  const handleCalibrate = async (quality: "good" | "bad" | null) => {
    setCalSaving(quality === null ? "clear" : quality);
    try {
      await calibrateMeeting(m.id, { quality, comment: calComment.trim() });
      onFeedbackSaved();
    } catch (err) {
      window.alert(`校正の保存に失敗: ${(err as Error).message}`);
    }
    setCalSaving(null);
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
            {/* メンバーがリーダー面談を見ている時は採点ボタンを出さない (教師データなので読み取り専用)。
                リーダー自身またはメンバー自分の面談の時だけ表示。 */}
            {!score && m.transcript_text && !rescoring && (isLeaderUser || !m.is_leader) && (
              <button
                onClick={handleRescoreClick}
                disabled={isScoringOther}
                className="text-[10px] font-extrabold text-duo-orange px-3 py-1.5 rounded-xl bg-duo-orange/10 hover:bg-duo-orange/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title={isScoringOther ? "他の採点が完了するまでお待ちください" : "この面談を AI 採点する (Shift+クリックで強制再生成)"}
              >
                ▶ AI 採点する
              </button>
            )}
            {!score && m.transcript_text && rescoring && (
              <span className="flex items-center gap-1.5 text-[10px] font-extrabold text-duo-orange px-3 py-1.5 rounded-xl bg-duo-orange/10">
                <span className="inline-block w-2 h-2 rounded-full bg-duo-orange animate-pulse" />
                採点中...
              </span>
            )}
            {score && m.transcript_text && (isLeaderUser || !m.is_leader) && (
              <button
                onClick={handleRescoreClick}
                disabled={rescoring || isScoringOther}
                className="text-[10px] font-extrabold text-duo-blue px-3 py-1.5 rounded-xl bg-duo-blue/10 hover:bg-duo-blue/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                title={isScoringOther ? "他の採点が完了するまでお待ちください" : "クリックで再採点 (Shift+クリックで強制再生成)"}
              >
                {rescoring ? "再採点中..." : "再採点"}
              </button>
            )}
            {rescoring && !score && (
              <span className="text-[10px] font-bold text-duo-orange px-3 py-1.5 rounded-xl bg-duo-orange/10">
                再採点中...
              </span>
            )}
            {/* 小林専用: AI を使わず手動採点。クォータ枯渇時の救済 */}
            {isLeaderUser && m.transcript_text && (
              <button
                onClick={() => setManualOpen(!manualOpen)}
                className="text-[10px] font-extrabold text-duo-purple px-3 py-1.5 rounded-xl bg-duo-purple/10 hover:bg-duo-purple/20 transition-colors"
                title="AI を使わず小林本人が直接スコアを入力"
              >
                ✏️ {score?._source === "manual_leader" ? "手動編集" : "手動採点"}
              </button>
            )}
            {/* 議事録を 01 LARK 形式に整形 (本人が引き出せた情報の構造化 → 採点の比較材料) */}
            {m.transcript_text && (
              <button
                onClick={async () => {
                  setDiagnosing(true);
                  try {
                    await diagnoseMeeting(m.id);
                    qc.invalidateQueries({ queryKey: ["meetings"] });
                    setDiagOpen(true);
                  } catch (e) {
                    setRescoreError((e as Error).message);
                  } finally { setDiagnosing(false); }
                }}
                disabled={diagnosing}
                className="text-[10px] font-extrabold text-emerald-700 px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 transition-colors disabled:opacity-40"
                title="議事録を初回診断フォーマット(LARK提出形式)に整形"
              >
                {diagnosing ? "整形中…" : score?.structured_diagnosis ? "📋 整形を更新" : "📋 候補者情報を整形"}
              </button>
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

          {/* アウトカム記録 (CVR 計測ブロック) は各カードのノイズになるため非表示 (小林/西村 FB)。
              データ収集が必要になったら別画面に集約する。 */}

          {/* 手動採点フォーム (小林専用) */}
          {isLeaderUser && manualOpen && (
            <ManualScoreForm
              meetingId={m.id}
              initial={score}
              onSaved={() => {
                setManualOpen(false);
                onFeedbackSaved();
              }}
              onCancel={() => setManualOpen(false)}
            />
          )}

          {/* 流し込んだ議事録本文 (折りたたみ・キーモーメントクリックで該当箇所に自動スクロール) */}
          {m.transcript_text && (
            <details
              ref={transcriptDetailsRef}
              className="rounded-xl bg-[#fafafa] border border-[#e5e5e5] p-3"
            >
              <summary className="cursor-pointer text-[10px] font-extrabold text-[#777] uppercase tracking-wider select-none">
                📝 流し込んだ議事録 ({m.transcript_text.length.toLocaleString()} 字)
              </summary>
              <pre ref={transcriptPreRef} className="mt-2 whitespace-pre-wrap text-[11px] font-bold text-[#4b4b4b] leading-relaxed max-h-96 overflow-y-auto" dangerouslySetInnerHTML={{
                __html: highlightedTranscript || escapeHtml(m.transcript_text),
              }} />
            </details>
          )}

          {/* Summary */}
          {m.summary && (
            <div className="rounded-xl bg-[#f7f7f7] p-3 prose prose-sm max-w-none text-xs text-[#4b4b4b]">
              <ReactMarkdown>{m.summary}</ReactMarkdown>
            </div>
          )}

          {/* 発話者フィルタの透明性表示 — 成功時 / 失敗時で明確に区別 */}
          {score?.target_speaker && (
            <>
              {score.speaker_filter_applied && (
                <div className="rounded-xl bg-green-50 border border-green-300 p-2.5">
                  <div className="text-[10px] font-extrabold text-green-800 leading-relaxed">
                    ✅ 採点対象: <span className="font-black">{score.target_speaker}さんの発言のみ</span>
                    （同席者の発言は除外済み）
                    {score.detected_speakers && score.detected_speakers.length > 0 && (
                      <span className="block text-[9px] font-bold text-green-700 mt-0.5">
                        議事録から検出した話者: {score.detected_speakers.join(" / ")}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {score.speaker_filter_failed && (
                <div className="rounded-xl bg-amber-50 border border-amber-300 p-2.5">
                  <div className="text-[10px] font-extrabold text-amber-900 leading-relaxed">
                    ⓘ この議事録は{score.target_speaker}さんの発言量が少なく、同席者の発言も含めて採点しています。
                    <span className="block text-[10px] font-bold text-amber-800 mt-0.5">
                      Google Meet の自動文字起こし形式（名前 HH:MM AM/PM）でご投入いただくと、{score.target_speaker}さん本人の発言だけで採点できます。
                    </span>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 西村 FB「リーダーの面談が34点で出るのは設計矛盾では」への説明バナー。
              絶対基準で採点するルールなので、リーダーも面談ごとに伸びしろあり、と明示。 */}
          {m.is_leader && score?.scores && (
            <div className="rounded-xl bg-amber-50 border border-amber-300 p-2.5">
              <p className="text-[10px] font-bold text-amber-900 leading-relaxed">
                ⓘ これは小林さんの面談です。チームの<b>お手本データ</b>として使われます。<br />
                採点は「各項目の条件をどれだけ満たしたか」で決まる仕組みなので、小林さんでも項目によっては満点でないことがあり、それが普通です（毎回 50 点満点が前提ではありません）。<br />
                雰囲気の良さではなく、<b>条件を満たした行動</b>が点数になります。
              </p>
            </div>
          )}

          {/* 📊 トーク傾向（機械分析・ピボットの中核）。議事録があれば採点前でも即表示。 */}
          {m.transcript_text && (
            <TalkTendencyPanel
              transcript={m.transcript_text}
              consultant={m.consultant_name || currentUser || "あなた"}
              onJump={(t) => jumpToTranscript(t, m.transcript_text || "")}
            />
          )}

          {/* 総合所感 (なぜこの評価かを一言で) */}
          {score?.overall && (
            <div className="rounded-xl bg-duo-blue/5 border border-duo-blue/20 p-3">
              <div className="text-[10px] font-extrabold text-duo-blue uppercase tracking-wider mb-1">総合所感</div>
              <p className="text-xs font-bold text-[#4b4b4b] leading-relaxed">{score.overall}</p>
            </div>
          )}

          {/* Score details */}
          {score?.scores && (
            <ScoreComparison score={score} leaderAvg={leaderAvg} isLeader={m.is_leader} />
          )}

          {/* 整形済み候補者情報 (01 LARK 形式)。これを基に小林と比較・採点する。 */}
          {score?.structured_diagnosis && (
            <details className="rounded-xl bg-emerald-50 border border-emerald-200 p-3" open={diagOpen}>
              <summary className="cursor-pointer select-none text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider">
                📋 候補者情報まとめ（LARK提出形式・この面談で引き出せた情報）
              </summary>
              <div className="mt-2 text-[11px] font-bold text-[#4b4b4b] leading-relaxed whitespace-pre-wrap">
                {score.structured_diagnosis}
              </div>
              {score.structured_diagnosis_at && (
                <p className="text-[9px] text-emerald-600 mt-2">整形日時: {new Date(score.structured_diagnosis_at).toLocaleString("ja-JP")}</p>
              )}
            </details>
          )}

          {/* Evidence = 各項目の点数理由。クリックでプレイバック(該当発言)へジャンプ。 */}
          {score?.evidence && (
            <div className="rounded-xl bg-[#fafafa] border border-[#e5e5e5] p-3 space-y-1.5">
              <div className="text-[10px] font-extrabold text-[#777] uppercase tracking-wider mb-1">
                なぜこの点数か（各項目の理由・クリックで該当場面へ）
              </div>
              {DIMS.map(({ key, label, color }) => {
                const ev = score.evidence?.[key as keyof typeof score.evidence];
                const sc = score.scores?.[key as keyof typeof score.scores];
                if (!ev) return null;
                return (
                  <button
                    key={key}
                    onClick={scrollToPlayback}
                    className="w-full flex items-start gap-2 text-left rounded-lg px-1.5 py-1 hover:bg-white transition-colors"
                    title="クリックで面談の該当場面（プレイバック）へ移動"
                  >
                    <span className="text-[10px] font-bold shrink-0 w-14 mt-0.5" style={{ color }}>
                      {label} {typeof sc === "number" ? `${sc}点` : ""}
                    </span>
                    <p className="flex-1 text-[10px] font-bold text-[#555] leading-relaxed">{ev}</p>
                    <span className="shrink-0 text-[10px] mt-0.5" style={{ color }}>▶</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* 旧「この面談固有のコーチング (amber box)」は軸別フィードバック (axis_feedback) に統合済。
              観察ベースで全 5 軸を機械合成する axis_feedback の方が網羅的で一般論が混じらないため、
              重複・反復感 (西村 FB「当たり前のこと言われてる感」) を避けて削除した。 */}

          {/* 商談タイムライン: 議事録上の時系列順に ◎/△/打ち手 を並べる
              西村 FB「議事録ベースで時間別のフィードバックが返ってきて欲しい」対応:
              - サーバ側で観察を議事録の出現位置でソート済 (AI の順番ミスを補正)
              - タイムスタンプは議事録の実テキストから直接抽出 (AI 任意フォーマットを補正)
              - 左列にタイムスタンプを固定幅で並べ、横向きの timeline rail として可視化
              - フェーズが切り替わるところに区切りラベルを挿入 */}
          {score?.observations && score.observations.length > 0 && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
              <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mb-2">
                <span className="text-[10px] font-extrabold text-slate-700 uppercase tracking-wider">
                  🧭 商談タイムライン ({score.observations.length} 場面・議事録時系列順)
                </span>
                {score._score_audit && typeof score._score_audit.adjusted_axes === "number" && score._score_audit.adjusted_axes > 0 && (
                  <span className="text-[9px] font-bold text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
                    観察集計でスコアを {score._score_audit.adjusted_axes} 軸補正
                  </span>
                )}
                {score._score_audit && ((score._score_audit.dropped_fake_observations || 0) + (score._score_audit.dropped_fake_coaching || 0)) > 0 && (
                  <span className="text-[9px] font-bold text-red-700 bg-red-100 rounded px-1.5 py-0.5">
                    捏造引用 {(score._score_audit.dropped_fake_observations || 0) + (score._score_audit.dropped_fake_coaching || 0)} 件を除外
                  </span>
                )}
                {score._score_audit?.leader_floor_applied && (
                  <span className="text-[9px] font-bold text-purple-700 bg-purple-100 rounded px-1.5 py-0.5" title={score._score_audit.leader_floor_note}>
                    リーダー基準点底上げ ({score._score_audit.leader_floor_axes_raised} 軸)
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-500 mb-3 leading-relaxed">
                議事録の出現順に並ぶ商談フィードバックです。タイムスタンプをクリックで議事録の該当箇所にジャンプ。
                各場面は ◎ 良かった / △ 惜しかった の判定。△ には次回こう言うべき具体セリフが付きます。
              </p>
              {(() => {
                const PHASE_META: Record<string, { label: string; emoji: string }> = {
                  opening:  { label: "冒頭",         emoji: "🚪" },
                  hearing:  { label: "ヒアリング",   emoji: "👂" },
                  proposal: { label: "提案",         emoji: "📋" },
                  closing:  { label: "クロージング", emoji: "🎯" },
                  wrap:     { label: "振り返り",     emoji: "📝" },
                };
                const obsList = score.observations || [];
                let lastPhase = "";
                return (
                  <ol className="relative border-l-2 border-slate-200 ml-2 space-y-1">
                    {obsList.map((o, idx) => {
                      const dim = DIMS.find((d) => d.key === o.axis);
                      const isStrong = o.assessment === "strong";
                      const phase = o.phase || "hearing";
                      const showPhaseHeader = phase !== lastPhase;
                      lastPhase = phase;
                      const meta = PHASE_META[phase] || PHASE_META.hearing;
                      const phaseNote = showPhaseHeader ? score.phase_summary?.[phase] : "";
                      return (
                        <li key={idx} className="relative pl-3">
                          {showPhaseHeader && (
                            <div className="my-2 -ml-5 pl-3 py-1 bg-slate-100 rounded border-l-4 border-slate-400">
                              <div className="text-[10px] font-extrabold text-slate-700">
                                {meta.emoji} {meta.label}
                              </div>
                              {phaseNote && (
                                <div className="text-[10px] font-bold text-slate-600 leading-relaxed mt-0.5">
                                  {phaseNote}
                                </div>
                              )}
                            </div>
                          )}
                          <span className={`absolute -left-[7px] top-2 w-3 h-3 rounded-full border-2 ${
                            isStrong ? "bg-green-400 border-green-600" : "bg-red-400 border-red-600"
                          }`} />
                          <div className="bg-white border border-slate-200 rounded-lg p-2 mb-1">
                            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                              {o.timestamp ? (
                                <button
                                  onClick={() => jumpToTranscript(o.quote, m.transcript_text || "")}
                                  className="text-[10px] font-extrabold tabular-nums text-slate-700 bg-slate-100 hover:bg-slate-200 rounded px-1.5 py-0.5 underline"
                                  title="議事録の該当箇所にジャンプ"
                                >
                                  ⏱ {o.timestamp}
                                </button>
                              ) : (
                                <button
                                  onClick={() => jumpToTranscript(o.quote, m.transcript_text || "")}
                                  className="text-[10px] font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 rounded px-1.5 py-0.5 underline"
                                  title="議事録の該当箇所にジャンプ"
                                >
                                  📍 場面 #{idx + 1}
                                </button>
                              )}
                              <span className={`text-[10px] font-extrabold rounded px-1.5 py-0.5 ${
                                isStrong ? "text-green-700 bg-green-50" : "text-red-700 bg-red-50"
                              }`}>{isStrong ? "◎ 良かった" : "△ 惜しかった"}</span>
                              {dim && (
                                <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded" style={{ backgroundColor: dim.color + "20", color: dim.color }}>
                                  {dim.label}
                                </span>
                              )}
                              {o.manual && (
                                <span className="text-[9px] font-extrabold rounded px-1.5 py-0.5 bg-indigo-100 text-indigo-700" title="リーダーが手動でタグ付けした観察 (= 教師データの最優先ソース)">
                                  📌 手動
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] font-bold text-[#4b4b4b] leading-relaxed">
                              「{o.quote}」
                            </p>
                            {o.why && (
                              <p className="text-[10px] text-slate-500 leading-relaxed mt-0.5">— {o.why}</p>
                            )}
                            {!isStrong && o.next_move && (
                              <p className="mt-1.5 text-[10px] font-bold text-green-700 leading-relaxed bg-green-50 border border-green-200 rounded px-1.5 py-1">
                                ✅ 次回はこう：「{o.next_move}」
                              </p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                );
              })()}
            </div>
          )}

          {/* Leader would */}
          {score?.leader_would && (
            <div className="rounded-xl bg-duo-purple/5 border border-duo-purple/20 p-3">
              <div className="text-[10px] font-extrabold text-duo-purple uppercase tracking-wider mb-1">リーダーならこうしてた</div>
              <p className="text-xs font-bold text-[#4b4b4b] leading-relaxed">{score.leader_would}</p>
            </div>
          )}

          {/* Key Moments Timeline (ダイジェストプレイバック) — 「なぜこの点数か」からここへジャンプ */}
          {score?.key_moments && score.key_moments.length > 0 && (
            <div ref={playbackRef}>
            <DigestTimeline moments={score.key_moments} onJumpToTranscript={(text) => jumpToTranscript(text, m.transcript_text || "")} />
            </div>
          )}

          {/* 軸別フィードバック: 5 軸すべてを「この面談の実発言」ベースで提示
              西村 FB (再三)「プレイブックのような一般論ではなく会話内容と連動した個別具体を各軸に」直接対応。
              サーバが検証済み observation から機械合成しているので、一般論は構造的に発生しない。 */}
          {score?.axis_feedback && Object.keys(score.axis_feedback).length > 0 && (
            <div className="rounded-xl bg-white border-2 border-[#e5e5e5] p-3 space-y-2">
              <div className="text-[10px] font-extrabold text-[#4b4b4b] uppercase tracking-wider mb-1">
                🧩 軸別フィードバック（この面談の発言ベース）
              </div>
              {/* 観察が 1 件も無い = フィードバックが出ていない状態。誤解を避けて再採点を促す。 */}
              {(score.observations?.length ?? 0) === 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 mb-1">
                  <p className="text-[11px] font-bold text-amber-800 leading-relaxed">
                    ⚠️ この面談はまだ発言レベルの観察が抽出できていません（古い採点の可能性）。
                  </p>
                  <p className="text-[10px] font-bold text-amber-700 leading-relaxed mt-0.5">
                    上の「再採点」を押すと、各軸の ◎/△・具体的な発言・次の一手が表示されます。
                  </p>
                </div>
              )}
              {DIMS.map(({ key, label, color }) => {
                const af = score.axis_feedback?.[key as keyof typeof score.axis_feedback];
                if (!af) return null;
                const strongN = af.strong?.length ?? 0;
                const weakN = af.weak?.length ?? 0;
                const hasContent = strongN > 0 || weakN > 0;
                return (
                  <div key={key} className="rounded-lg border border-[#eee] overflow-hidden">
                    {/* 採点の根拠ヘッダー: ◎N / △M → スコア (どう評価されたかを明示) */}
                    <div className="flex items-center gap-2 px-2.5 py-1.5 flex-wrap" style={{ backgroundColor: color + "12" }}>
                      <span className="text-[11px] font-extrabold px-1.5 py-0.5 rounded" style={{ backgroundColor: color + "25", color }}>
                        {label}
                      </span>
                      <span className="text-[11px] font-extrabold tabular-nums" style={{ color }}>{af.score} 点</span>
                      {hasContent && (
                        <span className="text-[9px] font-bold text-[#777]">
                          （良い場面 <span className="text-green-700">◎{strongN}</span> / 惜しい場面 <span className="text-red-700">△{weakN}</span> から算出）
                        </span>
                      )}
                      {!hasContent && <span className="text-[9px] font-bold text-[#aaa]">この軸の観察なし（議事録に該当場面が見当たらず）</span>}
                    </div>
                    {hasContent && (
                      <div className="p-2 space-y-1.5">
                        {/* ▶ プレイバック: 各発言をクリックすると議事録の該当箇所にジャンプ */}
                        {(af.strong ?? []).map((s, i) => (
                          <div key={`s${i}`} className="flex items-start gap-1.5">
                            <span className="shrink-0 text-[10px] font-extrabold text-green-700 bg-green-50 rounded px-1 mt-[1px]">◎</span>
                            <div className="flex-1 min-w-0">
                              <button
                                onClick={() => jumpToTranscript(s.quote, m.transcript_text || "")}
                                className="text-left text-[11px] font-bold text-[#4b4b4b] leading-relaxed hover:underline"
                                title="クリックで議事録の該当箇所を再生 (ジャンプ)"
                              >
                                <span className="text-[9px] text-slate-400 mr-1">▶</span>
                                {s.timestamp && <span className="text-[9px] font-extrabold tabular-nums text-slate-500 mr-1">⏱{s.timestamp}</span>}
                                「{s.quote}」
                              </button>
                              {s.why && <p className="text-[10px] text-slate-500 leading-relaxed">— {s.why}（ここが加点）</p>}
                            </div>
                          </div>
                        ))}
                        {(af.weak ?? []).map((w, i) => (
                          <div key={`w${i}`} className="flex items-start gap-1.5">
                            <span className="shrink-0 text-[10px] font-extrabold text-red-700 bg-red-50 rounded px-1 mt-[1px]">△</span>
                            <div className="flex-1 min-w-0">
                              <button
                                onClick={() => jumpToTranscript(w.quote, m.transcript_text || "")}
                                className="text-left text-[11px] font-bold text-[#4b4b4b] leading-relaxed hover:underline"
                                title="クリックで議事録の該当箇所を再生 (ジャンプ)"
                              >
                                <span className="text-[9px] text-slate-400 mr-1">▶</span>
                                {w.timestamp && <span className="text-[9px] font-extrabold tabular-nums text-slate-500 mr-1">⏱{w.timestamp}</span>}
                                「{w.quote}」
                              </button>
                              {w.why && <p className="text-[10px] text-slate-500 leading-relaxed">— {w.why}（ここが伸びしろ）</p>}
                              {w.next_move && (
                                <p className="mt-0.5 text-[10px] font-bold text-green-700 leading-relaxed bg-green-50 border border-green-200 rounded px-1.5 py-1">
                                  ✅ 次回はこう：「{w.next_move}」
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                        {/* 📚 この軸を伸ばすための学習 (アプリ内教材を開く・外部URLは使わない) */}
                        <button
                          onClick={() => setLearnAxis(key as "needs" | "proposal" | "trust" | "closing" | "intel")}
                          className="mt-1 w-full text-left rounded-md bg-[#f7f9ff] border border-[#dde6ff] px-2 py-1.5 hover:border-duo-blue transition-colors"
                        >
                          <span className="text-[9px] font-extrabold text-duo-blue">📚 {label}を伸ばす（面談技術・業界知識・顧客知識）</span>
                          <span className="text-[9px] font-extrabold text-duo-blue ml-1">学ぶ →</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {(score.observations?.length ?? 0) > 0 && (
                <p className="text-[9px] text-[#aaa] leading-relaxed pt-1">
                  ※ ◎/△ はすべて議事録の実発言から抽出。発言をクリックすると議事録の該当箇所に飛びます（プレイバック）。
                </p>
              )}
            </div>
          )}

          {/* 引き出し力の比較: 本人が引き出せた情報 vs 小林ならどう引き出していたか
              (西村 FB「面談で引き出せた情報を学習データの小林と比べる」直接対応) */}
          {score?.leader_comparison && Object.keys(score.leader_comparison).length > 0 && !m.is_leader && (
            <div className="rounded-xl bg-[#fff7ed] border-2 border-[#FF9600] p-3 space-y-2">
              <div className="text-[10px] font-extrabold text-[#cc7800] uppercase tracking-wider mb-1">
                🔍 引き出し力の比較（小林ならどこまで引き出していたか）
              </div>
              {DIMS.map(({ key, label, color }) => {
                const c = score.leader_comparison?.[key as keyof typeof score.leader_comparison];
                if (!c || (!c.extracted && !c.leader_would && !c.gap)) return null;
                return (
                  <div key={key} className="rounded-lg bg-white border border-[#f0d9b0] p-2.5">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded" style={{ backgroundColor: color + "20", color }}>
                        {label}
                      </span>
                      {c.gap && (
                        <span className="text-[9px] font-bold text-[#cc7800] bg-amber-50 rounded px-1.5 py-0.5">
                          差分: {c.gap}
                        </span>
                      )}
                    </div>
                    {c.extracted && (
                      <p className="text-[11px] font-bold text-[#4b4b4b] leading-relaxed mb-1">
                        <span className="text-[9px] font-extrabold text-blue-700 mr-1">あなたが引き出した:</span>
                        {c.extracted}
                      </p>
                    )}
                    {c.leader_would && (
                      <p className="text-[11px] font-bold text-[#996600] leading-relaxed bg-[#fff7ed] border border-[#f0d9b0] rounded px-2 py-1">
                        <span className="text-[9px] font-extrabold text-[#cc7800] mr-1">🥇 小林ならさらに:</span>
                        {c.leader_would}
                      </p>
                    )}
                  </div>
                );
              })}
              <p className="text-[9px] text-[#996600] leading-relaxed pt-1">
                ※ 教師データ（小林の18件と抽出された流儀）と本人の発言を比較し、引き出せた情報の差分を表示しています。
              </p>
            </div>
          )}

          {/* フィードバック（注釈）— 西村FB 2026-07-18: 誰でも入力できる & 入力を簡単に。
              採点の有無に関係なく、議事録さえあれば常に書ける。 */}
          <div className="rounded-xl bg-[#fffbeb] border border-[#fbbf24] p-3 space-y-2">
            <div className="text-[10px] font-extrabold text-[#92400e] uppercase tracking-wider">
              💬 フィードバック（誰でも入力できます）
            </div>
            {m.leader_feedback && (
              <div className="rounded-lg bg-white border border-[#fde68a] p-2.5">
                <p className="text-xs font-bold text-[#4b4b4b] leading-relaxed whitespace-pre-wrap">{m.leader_feedback}</p>
              </div>
            )}
            <textarea
              value={fbText}
              onChange={(e) => setFbText(e.target.value)}
              placeholder={m.leader_feedback
                ? "コメントを書き換える（保存すると上書きされます）"
                : "気づいたことを一言でOK。例: 冒頭の要約が丁寧で入りやすい／年収の掘り下げが浅い"}
              className="w-full rounded-xl border-2 border-[#e5e5e5] px-3 py-2 text-xs font-bold text-[#4b4b4b] h-16 focus:border-[#fbbf24] focus:outline-none resize-none"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleFeedbackSave}
                disabled={!fbText.trim() || fbSaving}
                className="btn-duo !px-4 !py-1.5 !text-[10px] text-white disabled:opacity-40"
                style={{ backgroundColor: "#f59e0b", borderBottomColor: "#d97706" }}
              >
                {fbSaving ? "保存中..." : m.leader_feedback ? "上書き保存" : "コメントを保存"}
              </button>
              {/* よく使う注釈をワンタップ入力（西村FB: 注釈入力をより容易に） */}
              {["深掘りが浅い", "説明が長い", "質問が良い", "次アクションが曖昧", "共感が丁寧"].map((tpl) => (
                <button
                  key={tpl}
                  onClick={() => setFbText((prev) => (prev ? `${prev} / ${tpl}` : tpl))}
                  className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white border border-[#fde68a] text-[#92400e] hover:bg-[#fef3c7]"
                >
                  + {tpl}
                </button>
              ))}
            </div>
          </div>

          {/* ─── リーダー校正パネル: 採点アンカー (リーダーのみ) ─── */}
          {isLeaderUser && (
            <div className="rounded-xl border-2 border-purple-300 bg-purple-50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-extrabold text-purple-800 uppercase tracking-wider">
                  🎯 この面談をお手本に登録（良い/悪い）
                </div>
                {m.calibration && (
                  <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full ${
                    m.calibration.quality === "good"
                      ? "bg-green-100 text-green-700 border border-green-300"
                      : "bg-red-100 text-red-700 border border-red-300"
                  }`}>
                    {m.calibration.quality === "good" ? "👍 良い面談として登録中" : "👎 悪い面談として登録中"}
                  </span>
                )}
              </div>
              <p className="text-[10px] font-bold text-purple-700 leading-relaxed">
                この面談を「良いお手本」「悪い例」として登録すると、次回以降の AI 採点がこれを見本にします。
                登録を増やすほど、AI の点数が小林さんの感覚に近づきます。
              </p>
              <textarea
                value={calComment}
                onChange={(e) => setCalComment(e.target.value)}
                placeholder="なぜ良い/悪いと判断したか (任意・最大500字)"
                className="w-full rounded-lg border border-purple-200 bg-white px-2 py-1.5 text-[11px] font-bold text-[#4b4b4b] h-14 focus:border-purple-500 focus:outline-none resize-none"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={() => handleCalibrate("good")}
                  disabled={calSaving !== null}
                  className={`flex-1 text-[10px] font-extrabold px-3 py-1.5 rounded-lg transition-all disabled:opacity-40 ${
                    m.calibration?.quality === "good"
                      ? "bg-green-600 text-white"
                      : "bg-white border-2 border-green-300 text-green-700 hover:bg-green-50"
                  }`}
                >
                  {calSaving === "good" ? "保存中..." : "👍 良い面談として登録"}
                </button>
                <button
                  onClick={() => handleCalibrate("bad")}
                  disabled={calSaving !== null}
                  className={`flex-1 text-[10px] font-extrabold px-3 py-1.5 rounded-lg transition-all disabled:opacity-40 ${
                    m.calibration?.quality === "bad"
                      ? "bg-red-600 text-white"
                      : "bg-white border-2 border-red-300 text-red-700 hover:bg-red-50"
                  }`}
                >
                  {calSaving === "bad" ? "保存中..." : "👎 改善の余地ありとして登録"}
                </button>
                {m.calibration && (
                  <button
                    onClick={() => handleCalibrate(null)}
                    disabled={calSaving !== null}
                    className="text-[10px] font-bold px-2 py-1.5 rounded-lg bg-white border-2 border-purple-200 text-purple-700 hover:bg-purple-50 disabled:opacity-40"
                  >
                    {calSaving === "clear" ? "..." : "解除"}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ─── 手動アノテーション (西村FB 2026-06-06「手動介入で精度向上ならやる」直接対応) ─── */}
          {isLeaderUser && m.transcript_text && (
            <div className="rounded-xl border-2 border-indigo-300 bg-indigo-50 p-3 space-y-2">
              <button
                onClick={() => { setAnnotOpen((v) => !v); setAnnotError(null); }}
                className="flex items-center justify-between w-full text-[10px] font-extrabold text-indigo-800 uppercase tracking-wider"
              >
                <span>📌 良かった/惜しかった場面を手動で登録 {m.calibration?.manual_observations ? `(${m.calibration.manual_observations.length} 件)` : ""}</span>
                <span>{annotOpen ? "▼" : "▶"}</span>
              </button>
              {!annotOpen && (
                <p className="text-[10px] font-bold text-indigo-700 leading-relaxed">
                  AI の判定ではなく、議事録の発言を直接「これは strong / weak」とタグ付けできます。
                  手動観察は AI 採点に最優先で参入し、ゴールド観察ライブラリ (全員の教師データ) にも即時反映されます。
                </p>
              )}

              {annotOpen && (
                <div className="space-y-2 bg-white border border-indigo-200 rounded-lg p-2.5">
                  {/* 既存の手動観察 */}
                  {(m.calibration?.manual_observations?.length ?? 0) > 0 && (
                    <div className="space-y-1">
                      <div className="text-[10px] font-extrabold text-indigo-700">既存の手動観察</div>
                      {m.calibration!.manual_observations!.map((mo, idx) => {
                        const dim = DIMS.find((d) => d.key === mo.axis);
                        return (
                          <div key={idx} className="flex items-start gap-1.5 bg-indigo-50 border border-indigo-100 rounded p-1.5">
                            <span className={`shrink-0 text-[10px] font-extrabold rounded px-1.5 ${
                              mo.assessment === "strong" ? "text-green-700 bg-green-100" : "text-red-700 bg-red-100"
                            }`}>{mo.assessment === "strong" ? "◎" : "△"}</span>
                            {dim && <span className="shrink-0 text-[9px] font-extrabold rounded px-1.5 py-0.5" style={{ backgroundColor: dim.color + "20", color: dim.color }}>{dim.label}</span>}
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-bold text-[#4b4b4b] leading-relaxed">「{mo.quote}」</p>
                              {mo.why && <p className="text-[10px] text-slate-500 leading-relaxed">— {mo.why}</p>}
                              {mo.next_move && <p className="text-[10px] font-bold text-green-700 leading-relaxed">✅ {mo.next_move}</p>}
                            </div>
                            <button
                              onClick={async () => {
                                if (!window.confirm("この手動観察を削除しますか？")) return;
                                try {
                                  await removeManualObservation(m.id, idx);
                                  qc.invalidateQueries({ queryKey: ["meetings"] });
                                } catch (e) {
                                  setAnnotError((e as Error).message);
                                }
                              }}
                              className="shrink-0 text-[10px] font-bold text-red-600 hover:text-red-800"
                              title="削除"
                            >✕</button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 新規追加フォーム */}
                  <div className="border-t border-indigo-100 pt-2 space-y-1.5">
                    <div className="text-[10px] font-extrabold text-indigo-700">新しい観察を追加</div>
                    <textarea
                      value={annotQuote}
                      onChange={(e) => setAnnotQuote(e.target.value)}
                      placeholder="議事録から該当する発言を 6 文字以上コピペ (改変・要約せず原文のまま)"
                      className="w-full rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-[11px] font-bold text-[#4b4b4b] h-16 focus:border-indigo-500 focus:outline-none resize-none"
                    />
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <label className="text-[9px] font-extrabold text-indigo-700 block mb-0.5">軸</label>
                        <select
                          value={annotAxis}
                          onChange={(e) => setAnnotAxis(e.target.value as typeof annotAxis)}
                          className="w-full text-[10px] font-bold rounded-md border border-indigo-200 px-1.5 py-1 bg-white"
                        >
                          <option value="needs">ニーズ</option>
                          <option value="proposal">提案</option>
                          <option value="trust">信頼</option>
                          <option value="closing">前進</option>
                          <option value="intel">情報</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] font-extrabold text-indigo-700 block mb-0.5">判定</label>
                        <select
                          value={annotAssessment}
                          onChange={(e) => setAnnotAssessment(e.target.value as typeof annotAssessment)}
                          className="w-full text-[10px] font-bold rounded-md border border-indigo-200 px-1.5 py-1 bg-white"
                        >
                          <option value="strong">◎ 良かった (strong)</option>
                          <option value="weak">△ 惜しかった (weak)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[9px] font-extrabold text-indigo-700 block mb-0.5">フェーズ</label>
                        <select
                          value={annotPhase}
                          onChange={(e) => setAnnotPhase(e.target.value as typeof annotPhase)}
                          className="w-full text-[10px] font-bold rounded-md border border-indigo-200 px-1.5 py-1 bg-white"
                        >
                          <option value="opening">冒頭</option>
                          <option value="hearing">ヒアリング</option>
                          <option value="proposal">提案</option>
                          <option value="closing">クロージング</option>
                          <option value="wrap">振り返り</option>
                        </select>
                      </div>
                    </div>
                    <input
                      value={annotWhy}
                      onChange={(e) => setAnnotWhy(e.target.value)}
                      placeholder="なぜ◎/△か (120字以内・任意)"
                      maxLength={120}
                      className="w-full rounded-lg border border-indigo-200 bg-white px-2 py-1.5 text-[10px] font-bold text-[#4b4b4b] focus:border-indigo-500 focus:outline-none"
                    />
                    {annotAssessment === "weak" && (
                      <input
                        value={annotNextMove}
                        onChange={(e) => setAnnotNextMove(e.target.value)}
                        placeholder="次回こう言うべき具体セリフ (200字以内・任意)"
                        maxLength={200}
                        className="w-full rounded-lg border border-green-200 bg-green-50 px-2 py-1.5 text-[10px] font-bold text-green-700 focus:border-green-500 focus:outline-none"
                      />
                    )}
                    {annotError && (
                      <div className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">⚠️ {annotError}</div>
                    )}
                    <div className="flex gap-1.5">
                      <button
                        onClick={async () => {
                          setAnnotSaving(true);
                          setAnnotError(null);
                          try {
                            await addManualObservation(m.id, {
                              quote: annotQuote.trim(),
                              axis: annotAxis,
                              assessment: annotAssessment,
                              phase: annotPhase,
                              why: annotWhy.trim() || undefined,
                              next_move: annotAssessment === "weak" ? (annotNextMove.trim() || undefined) : undefined,
                            });
                            setAnnotQuote("");
                            setAnnotWhy("");
                            setAnnotNextMove("");
                            qc.invalidateQueries({ queryKey: ["meetings"] });
                          } catch (e) {
                            setAnnotError((e as Error).message);
                          } finally {
                            setAnnotSaving(false);
                          }
                        }}
                        disabled={annotSaving || annotQuote.trim().length < 6}
                        className="flex-1 text-[10px] font-extrabold px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40"
                      >
                        {annotSaving ? "保存中..." : "📌 観察を追加"}
                      </button>
                    </div>
                    <p className="text-[9px] text-indigo-600 leading-relaxed">
                      ※ 引用は議事録に実在するか自動チェックされます（言い換え・要約は登録できません。発言をそのままコピーしてください）。<br />
                      ※ 登録した「良かった/惜しかった」は、次回以降の採点でお手本として使われ、チーム全員の採点基準に反映されます。
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 校正済み議事録には常時バッジ表示 (リーダー以外も「これはアンカー」と分かる) */}
          {!isLeaderUser && m.calibration && (
            <div className={`rounded-xl border p-2.5 ${
              m.calibration.quality === "good"
                ? "bg-green-50 border-green-200"
                : "bg-red-50 border-red-200"
            }`}>
              <div className={`text-[10px] font-extrabold leading-relaxed ${
                m.calibration.quality === "good" ? "text-green-800" : "text-red-800"
              }`}>
                {m.calibration.quality === "good"
                  ? "👍 リーダーが「良い面談」と判定 (採点アンカーとして AI に反映中)"
                  : "👎 リーダーが「改善余地あり」と判定 (採点アンカーとして AI に反映中)"}
                {m.calibration.comment && (
                  <span className="block mt-1 font-bold opacity-80">「{m.calibration.comment}」</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* アプリ内学習モーダル (軸別の「学ぶ」から開く・外部URLは使わない) */}
      {learnAxis && <LearningModal axis={learnAxis} onClose={() => setLearnAxis(null)} />}
    </div>
  );
}

const DIMS = [
  { key: "needs", label: "ニーズ", color: "#1CB0F6" },
  { key: "proposal", label: "提案", color: "#58CC02" },
  { key: "trust", label: "信頼", color: "#CE82FF" },
  { key: "closing", label: "前進", color: "#FF9600" },
  { key: "intel", label: "情報", color: "#FF4B4B" },
] as const;

// 面談アウトカム (CVR 分析の基礎データ) 入力ボタン。
function OutcomeButtons({ meeting, onSaved }: { meeting: MeetingTranscript; onSaved: () => void }) {
  const [saving, setSaving] = useState<string | null>(null);
  const outcome = meeting.outcome || {};
  const isLost = outcome.lost === true;
  const [lostReason, setLostReason] = useState(outcome.lost_reason || "");

  const save = async (patch: Partial<NonNullable<MeetingTranscript["outcome"]>>) => {
    setSaving(Object.keys(patch)[0]);
    try {
      const merged = { ...outcome, ...patch };
      await saveMeetingOutcome(meeting.id, {
        next_meeting: merged.next_meeting,
        applied: merged.applied,
        hired: merged.hired,
        lost: merged.lost,
        lost_reason: merged.lost_reason || undefined,
      });
      onSaved();
    } catch (err) {
      window.alert(`保存失敗: ${(err as Error).message}`);
    }
    setSaving(null);
  };

  const Btn = ({ flag, label, emoji, color }: { flag: keyof NonNullable<MeetingTranscript["outcome"]>; label: string; emoji: string; color: string }) => {
    const active = outcome[flag] === true;
    return (
      <button
        onClick={() => save({ [flag]: !active })}
        disabled={saving !== null}
        className={`text-[10px] font-extrabold px-2.5 py-1.5 rounded-xl transition-all disabled:opacity-40 ${
          active ? "text-white" : "text-[#777] bg-[#f0f0f0] hover:bg-[#e5e5e5]"
        }`}
        style={active ? { backgroundColor: color } : undefined}
      >
        {emoji} {label} {active ? "✓" : ""}
      </button>
    );
  };

  return (
    <div className="rounded-xl bg-[#f7f7f7] border border-[#e5e5e5] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-extrabold text-[#777] uppercase tracking-wider">📊 この初回面談の結果 (CVR 計測用)</span>
        {outcome.recorded_at && (
          <span className="text-[9px] font-bold text-[#aaa]">記録: {new Date(outcome.recorded_at).toLocaleDateString("ja-JP")}</span>
        )}
      </div>
      {/* 初回面談の CVR に絞る。採用決定は初回からは発生しないため項目から除外 (西村氏FB)。 */}
      <div className="flex flex-wrap gap-1.5">
        <Btn flag="next_meeting" label="次回予約取れた" emoji="📅" color="#1CB0F6" />
        <Btn flag="applied" label="求人応募に進んだ" emoji="📨" color="#58CC02" />
        <Btn flag="lost" label="不成立" emoji="❌" color="#FF4B4B" />
      </div>
      {isLost && (
        <div className="flex gap-2">
          <input
            type="text"
            value={lostReason}
            onChange={(e) => setLostReason(e.target.value)}
            onBlur={() => lostReason !== (outcome.lost_reason || "") && save({ lost_reason: lostReason })}
            placeholder="不成立の理由 (任意・後で集計に使う)"
            className="flex-1 text-[10px] font-bold border-2 border-[#e5e5e5] rounded-lg px-2 py-1 focus:border-duo-red focus:outline-none"
            maxLength={500}
          />
        </div>
      )}
    </div>
  );
}

// 小林専用の手動採点フォーム。Gemini を使わず 5 軸スコアを直接 DB 保存。
function ManualScoreForm({
  meetingId,
  initial,
  onSaved,
  onCancel,
}: {
  meetingId: string;
  initial: MeetingScore | null | undefined;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [scores, setScores] = useState({
    needs: initial?.scores?.needs ?? 5,
    proposal: initial?.scores?.proposal ?? 5,
    trust: initial?.scores?.trust ?? 5,
    closing: initial?.scores?.closing ?? 5,
    intel: initial?.scores?.intel ?? 5,
  });
  const [evidence, setEvidence] = useState({
    needs: initial?.evidence?.needs ?? "",
    proposal: initial?.evidence?.proposal ?? "",
    trust: initial?.evidence?.trust ?? "",
    closing: initial?.evidence?.closing ?? "",
    intel: initial?.evidence?.intel ?? "",
  });
  const [improvements, setImprovements] = useState((initial?.improvements ?? []).join("\n"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await manualScoreMeeting(meetingId, {
        scores,
        evidence,
        improvements: improvements.split("\n").map((s) => s.trim()).filter(Boolean),
      });
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    }
    setSaving(false);
  };

  return (
    <div className="rounded-xl bg-duo-purple/5 border-2 border-duo-purple/30 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-extrabold text-duo-purple">✏️ 小林手動採点 (AI 不使用)</p>
        <button onClick={onCancel} className="text-[10px] font-bold text-[#777] hover:text-[#4b4b4b]">キャンセル</button>
      </div>
      <p className="text-[10px] font-bold text-[#777]">Gemini クォータ枯渇時や AI 採点を上書きしたい時に使用。即座に DB 保存されます。</p>

      {/* スコア入力 */}
      <div className="space-y-2">
        {DIMS.map(({ key, label, color }) => (
          <div key={key} className="flex items-start gap-2">
            <div className="w-20 shrink-0">
              <div className="text-[11px] font-extrabold" style={{ color }}>{label}</div>
              <input
                type="number"
                min={0}
                max={10}
                value={scores[key as keyof typeof scores]}
                onChange={(e) => setScores({ ...scores, [key]: Math.max(0, Math.min(10, parseInt(e.target.value || "0", 10))) })}
                className="w-16 text-center text-sm font-extrabold border-2 border-[#e5e5e5] rounded-lg px-1 py-0.5 focus:border-duo-purple focus:outline-none"
              />
              <div className="text-[9px] font-bold text-[#aaa] mt-0.5">/ 10</div>
            </div>
            <textarea
              value={evidence[key as keyof typeof evidence]}
              onChange={(e) => setEvidence({ ...evidence, [key]: e.target.value })}
              placeholder={`${label}の根拠 (任意・100字以内)`}
              rows={2}
              maxLength={300}
              className="flex-1 text-[10px] font-bold border-2 border-[#e5e5e5] rounded-lg px-2 py-1 focus:border-duo-purple focus:outline-none resize-none"
            />
          </div>
        ))}
      </div>

      {/* 改善ポイント */}
      <div>
        <div className="text-[11px] font-extrabold text-[#4b4b4b] mb-1">改善ポイント (1 行 1 件・任意)</div>
        <textarea
          value={improvements}
          onChange={(e) => setImprovements(e.target.value)}
          placeholder="例:&#10;クロージングで期限を切れていない&#10;他社状況をもっと聞き出すべき"
          rows={3}
          className="w-full text-[10px] font-bold border-2 border-[#e5e5e5] rounded-lg px-2 py-1 focus:border-duo-purple focus:outline-none resize-none"
        />
      </div>

      {/* 合計表示 */}
      <div className="text-[10px] font-bold text-[#777]">
        合計: {Object.values(scores).reduce((s, v) => s + v, 0)} / 50
      </div>

      {error && (
        <div className="text-[10px] font-bold text-duo-red bg-duo-red/10 p-2 rounded-lg">{error}</div>
      )}

      <button
        onClick={save}
        disabled={saving}
        className="btn-duo btn-duo-blue w-full !py-2 !text-xs disabled:opacity-40"
      >
        {saving ? "保存中..." : "💾 採点を保存"}
      </button>
    </div>
  );
}

// "午前10:05" / "午後06:23" / "18:23" を 0:00 起点の分に換算。失敗時 null。
function timestampToMinutes(raw: string): number | null {
  const s = raw.trim();
  const pmMatch = s.match(/午後\s*(\d{1,2}):(\d{2})/);
  if (pmMatch) {
    const h = parseInt(pmMatch[1], 10);
    return ((h === 12 ? 12 : h + 12) * 60) + parseInt(pmMatch[2], 10);
  }
  const amMatch = s.match(/午前\s*(\d{1,2}):(\d{2})/);
  if (amMatch) {
    const h = parseInt(amMatch[1], 10);
    return ((h === 12 ? 0 : h) * 60) + parseInt(amMatch[2], 10);
  }
  const plain = s.match(/(\d{1,2}):(\d{2})/);
  if (plain) return parseInt(plain[1], 10) * 60 + parseInt(plain[2], 10);
  return null;
}

function DigestTimeline({ moments, onJumpToTranscript }: { moments: KeyMoment[]; onJumpToTranscript?: (text: string) => void }) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 議事録の timestamp 文字列を絶対分に換算 → 0 起点の相対秒に正規化。
  const minutes = moments.map((m) => (m.timestamp ? timestampToMinutes(m.timestamp) : null));
  const validMinutes = minutes.filter((n): n is number => n != null);
  const baseMinute = validMinutes.length > 0 ? Math.min(...validMinutes) : 0;
  const relativeSeconds = minutes.map((n) => (n != null ? (n - baseMinute) * 60 : null));
  const hasTimestamps = relativeSeconds.some((n) => n != null);
  const maxSec = hasTimestamps ? Math.max(...relativeSeconds.filter((n): n is number => n != null), 1) : 0;

  const handleDotClick = (idx: number) => {
    setSelectedIdx(idx === selectedIdx ? null : idx);
    const el = listRef.current?.querySelector(`[data-moment="${idx}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    // 議事録セクションへのジャンプ要求 (親が議事録 details を開いて該当箇所にスクロール)
    const m = moments[idx];
    if (m?.text && onJumpToTranscript) onJumpToTranscript(m.text);
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
            {moments.map((m, origIdx) => {
              const sec = relativeSeconds[origIdx];
              if (sec == null) return null;
              const left = (sec / maxSec) * 100;
              const dim = DIMS.find((d) => d.key === m.axis);
              const isActive = selectedIdx === origIdx;
              return (
                <button
                  key={origIdx}
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
                  <span className={`text-[10px] font-black ${gap >= 0 ? "text-duo-green" : "text-duo-red"}`}
                    title="リーダー(小林)の全面談の平均点との差。平均なので、1件の好面談では平均を上回ることもあります。">
                    {gap >= 0 ? `+${gap}` : gap} vs リーダー平均
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
