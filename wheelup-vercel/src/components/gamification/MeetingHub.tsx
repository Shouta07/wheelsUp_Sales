import { useState, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { useGamification } from "../../gamification/GamificationProvider";
import { TEAM_MEMBERS, isLeader as isLeaderRole } from "../../lib/team";
import TalkTendencyPanel from "./TalkTendencyPanel";
import MemberSummaryPanel from "./MemberSummaryPanel";
import { analyzeTalk, talkStatsToCsvRow, rowsToCsv } from "../../lib/talkAnalysis";
import {
  fetchMeetings,
  createMeeting,
  deleteMeeting,
  summarizeMeeting,
  diagnoseMeeting,
  addLeaderFeedback,
  sendWeeklyReport,
  type MeetingTranscript,
} from "../../api/client";

/**
 * 面談ライブラリ。
 * 西村 FB 2026-07-18 のピボットに合わせて構成を簡素化:
 *   - AI採点まわり（5軸スコア/軸別FB/商談タイムライン/校正/手動アノテーション/学習教材）は撤去
 *   - 残すのは「トーク傾向の可視化」「フィードバック(注釈)」「議事録」「CSV出力」
 *   - 階級性をなくし、メンバータブで誰の面談でも閲覧・FB入力できる
 */

const todayInputValue = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
};

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function groupByDate(meetings: MeetingTranscript[]) {
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

export default function MeetingHub() {
  const { currentUser } = useGamification();
  const qc = useQueryClient();

  // タブ = メンバー名（誰でも誰のタブも開ける）。初期タブは自分。
  const [tab, setTab] = useState<string>(currentUser || TEAM_MEMBERS[0].name);
  const [uploading, setUploading] = useState(false);
  const [textInput, setTextInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [dateInput, setDateInput] = useState<string>(todayInputValue);
  const [showUpload, setShowUpload] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [sendingReport, setSendingReport] = useState(false);

  const { data: allMeetings } = useQuery({
    queryKey: ["meetings", "all"],
    queryFn: () => fetchMeetings(),
    enabled: !!currentUser,
  });

  // 担当者名でグルーピング。DB の consultant_name は表記ゆれ（「西村」/「西村康佑」など）が
  // あり得るため、完全一致だけでなく前方一致・部分一致でもチームメンバーに寄せる。
  // どのメンバーにも該当しないものは「その他」タブに入れて取りこぼさない。
  const OTHER = "その他";
  const { byMember, unassignedCount } = useMemo(() => {
    const map = new Map<string, MeetingTranscript[]>();
    for (const mem of TEAM_MEMBERS) map.set(mem.name, []);
    map.set(OTHER, []);
    const norm = (s: string) => s.replace(/\s|　/g, "");
    for (const m of allMeetings?.transcripts || []) {
      const raw = norm(m.consultant_name || "");
      const hit = TEAM_MEMBERS.find((mem) => {
        const n = norm(mem.name);
        return raw === n || raw.startsWith(n) || raw.includes(n);
      });
      map.get(hit ? hit.name : OTHER)!.push(m);
    }
    return { byMember: map, unassignedCount: map.get(OTHER)!.length };
  }, [allMeetings]);

  const meetings = byMember.get(tab) || [];
  const totalLoaded = allMeetings?.transcripts?.length ?? 0;

  const handleTextSave = async () => {
    if (!textInput.trim()) return;
    setUploading(true);
    setErrorMsg(null);
    try {
      await createMeeting({
        title: titleInput || `${currentUser} 面談記録`,
        transcript_text: textInput,
        consultant_name: currentUser,
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

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`「${title}」を削除します。よろしいですか？`)) return;
    try {
      await deleteMeeting(id);
      qc.invalidateQueries({ queryKey: ["meetings"] });
    } catch (err) {
      setErrorMsg(`削除に失敗しました: ${(err as Error).message}`);
    }
  };

  const exportCsv = () => {
    const rows = meetings
      .filter((mt) => mt.transcript_text)
      .map((mt) => {
        const s = analyzeTalk(mt.transcript_text || "", mt.consultant_name || tab);
        if (!s) return null;
        return talkStatsToCsvRow({
          date: (mt.recorded_at || "").slice(0, 10),
          title: mt.title || "",
          consultant: mt.consultant_name || tab,
        }, s);
      })
      .filter((r): r is Record<string, string | number> => !!r);
    if (rows.length === 0) {
      window.alert("分析できる議事録がありません（話者ラベル付きの議事録が必要です）");
      return;
    }
    const blob = new Blob([rowsToCsv(rows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `talk_tendency_${tab}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-2xl bg-white border-2 border-[#e5e5e5] p-4">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-black text-[#4b4b4b]">面談ライブラリ</h2>
        <div className="flex items-center gap-2">
          {meetings.length > 0 && (
            <button
              onClick={exportCsv}
              className="text-[10px] font-extrabold px-3 py-1.5 rounded-xl bg-[#f1f5f9] text-[#475569] hover:bg-[#e2e8f0] transition-colors"
              title="表示中のメンバーのトーク傾向をCSVで出力"
            >
              ⬇ CSV出力
            </button>
          )}
          {isLeaderRole(currentUser) && (
            <button
              onClick={async () => {
                if (!window.confirm("直近7日間のトーク傾向サマリーを Lark に送信します。よろしいですか？")) return;
                setSendingReport(true);
                try {
                  const r = await sendWeeklyReport();
                  const rep = r.report;
                  window.alert(
                    `✅ Lark に送信しました\n\n期間: ${rep.periodLabel}\n面談 ${rep.totalMeetings} 件（分析 ${rep.analyzed} 件）\n` +
                    `チェックしたい面談: ${rep.alerts.length} 件`,
                  );
                } catch (e) {
                  window.alert(`❌ ${(e as Error).message}`);
                }
                setSendingReport(false);
              }}
              disabled={sendingReport}
              className="text-[10px] font-extrabold px-3 py-1.5 rounded-xl bg-[#fef3c7] text-[#92400e] hover:bg-[#fde68a] transition-colors disabled:opacity-40"
              title="直近7日間のサマリーを Lark に送信（毎週月曜9時に自動送信されます）"
            >
              {sendingReport ? "送信中…" : "📣 週次サマリーを送信"}
            </button>
          )}
          {tab === currentUser && (
            <button
              onClick={() => setShowUpload(!showUpload)}
              className="btn-duo btn-duo-green !px-3 !py-1.5 !text-[10px]"
            >
              + 面談を追加
            </button>
          )}
        </div>
      </div>

      {/* メンバータブ（誰でも誰の面談も閲覧・FB入力できる） */}
      <div className="flex gap-1 mb-2 overflow-x-auto pb-1">
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
        {/* 担当者名がチーム定義と一致しない面談の受け皿（取りこぼし防止） */}
        {unassignedCount > 0 && (
          <button
            onClick={() => setTab(OTHER)}
            className={`shrink-0 px-3 py-2 rounded-xl text-xs font-extrabold transition-colors ${
              tab === OTHER ? "bg-[#64748b] text-white" : "text-[#8a8a8a] hover:bg-[#f2f4f7]"
            }`}
          >
            その他 <span className="text-[10px] tabular-nums opacity-80">{unassignedCount}</span>
          </button>
        )}
      </div>

      <p className="text-[10px] font-bold text-[#afafaf] mb-3">
        チーム全体 {totalLoaded} 件を読み込み済み・タブで担当者を切り替えられます
      </p>

      {tab !== currentUser && (
        <div className="mb-3 rounded-xl bg-[#F3F5F8] border border-[#E2E6EC] px-3 py-2">
          <p className="text-[11px] font-bold text-[#555]">
            {tab === OTHER
              ? "👀 担当者名がチーム設定と一致しない面談です。トーク傾向の確認とフィードバックの入力ができます。"
              : <>👀 <b>{tab}</b>さんの面談を閲覧中です。トーク傾向の確認と、フィードバック（注釈）の入力ができます。</>}
          </p>
        </div>
      )}

      {/* 面談追加フォーム */}
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
          </div>
          <textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="議事録テキストを貼り付け..."
            className="w-full h-32 rounded-xl border-2 border-[#e5e5e5] px-3 py-2 text-xs font-bold text-[#4b4b4b] focus:border-duo-blue focus:outline-none resize-none"
          />
          <button
            onClick={handleTextSave}
            disabled={!textInput.trim() || uploading}
            className="btn-duo btn-duo-green !px-4 !py-2 !text-xs disabled:opacity-40"
          >
            {uploading ? "保存中..." : "保存する"}
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="mb-3 rounded-xl bg-red-50 border border-red-200 px-3 py-2">
          <p className="text-[11px] font-bold text-red-700">{errorMsg}</p>
        </div>
      )}

      {/* タブのメンバーのサマリーダッシュボード */}
      {meetings.length > 0 && (
        <MemberSummaryPanel
          meetings={meetings}
          memberName={tab}
          color={TEAM_MEMBERS.find((mm) => mm.name === tab)?.color || "#64748b"}
        />
      )}

      {/* 面談リスト */}
      <div className="space-y-3">
        {meetings.length === 0 && (
          <div className="rounded-2xl bg-[#f7f7f7] p-6 text-center">
            <span className="text-3xl block mb-2">📝</span>
            <p className="text-sm font-bold text-[#777]">
              {tab === currentUser
                ? "面談を追加すると、トーク傾向が自動で分析されます"
                : tab === OTHER
                  ? "該当する面談はありません"
                  : `${tab}さんの面談はまだ登録されていません`}
            </p>
          </div>
        )}

        {groupByDate(meetings).map((group) => (
          <div key={group.dateKey} className="space-y-3">
            <div className="sticky top-0 z-10 bg-[#f0f4ff] px-3 py-1.5 rounded-lg">
              <span className="text-[11px] font-extrabold text-[#4b6bff]">{group.dateLabel}</span>
              <span className="text-[10px] font-bold text-[#aaa] ml-2">{group.items.length} 件</span>
            </div>
            {group.items.map((m) => (
              <MeetingEntry
                key={m.id}
                meeting={m}
                currentUser={currentUser || ""}
                onDelete={handleDelete}
                onChanged={() => qc.invalidateQueries({ queryKey: ["meetings"] })}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MeetingEntry({
  meeting: m, currentUser, onDelete, onChanged,
}: {
  meeting: MeetingTranscript;
  currentUser: string;
  onDelete: (id: string, title: string) => void;
  onChanged: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [fbText, setFbText] = useState("");
  const [fbSaving, setFbSaving] = useState(false);
  const [busy, setBusy] = useState<null | "summary" | "diagnose">(null);
  const [err, setErr] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState("");
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);

  const diagnosis = (m.score_data as { structured_diagnosis?: string } | null)?.structured_diagnosis;
  const isMine = m.consultant_name === currentUser;

  const jumpToTranscript = (snippet: string) => {
    const full = m.transcript_text || "";
    const clean = snippet.replace(/^「|」$/g, "").trim();
    if (!clean || !full) return;
    const idx = full.indexOf(clean.slice(0, 40));
    if (detailsRef.current) detailsRef.current.open = true;
    if (idx < 0) { setHighlighted(escapeHtml(full)); return; }
    const before = escapeHtml(full.slice(0, idx));
    const matched = escapeHtml(full.slice(idx, idx + clean.length));
    const after = escapeHtml(full.slice(idx + clean.length));
    setHighlighted(`${before}<mark id="km-jump" style="background:#fde68a;padding:1px 2px;border-radius:3px;">${matched}</mark>${after}`);
    requestAnimationFrame(() => {
      preRef.current?.querySelector("#km-jump")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const saveFeedback = async () => {
    setFbSaving(true);
    setErr(null);
    try {
      await addLeaderFeedback(m.id, fbText);
      setFbText("");
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
    setFbSaving(false);
  };

  const run = async (kind: "summary" | "diagnose") => {
    setBusy(kind);
    setErr(null);
    try {
      if (kind === "summary") await summarizeMeeting(m.id);
      else await diagnoseMeeting(m.id);
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(null);
  };

  return (
    <div className="rounded-2xl border-2 border-[#e5e5e5] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#fafafa] transition-colors text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-[#4b4b4b] truncate">{m.title}</p>
          <p className="text-[10px] font-bold text-[#afafaf] mt-0.5">
            {new Date(m.recorded_at).toLocaleDateString("ja-JP")} · {m.consultant_name}
            {m.leader_feedback && <span className="ml-2 text-[#d97706]">💬 コメントあり</span>}
          </p>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#afafaf"
          className={`shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}>
          <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z" />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* 操作 */}
          <div className="flex gap-2 flex-wrap items-center">
            {!m.summary && m.transcript_text && (
              <button
                onClick={() => run("summary")}
                disabled={busy !== null}
                className="text-[10px] font-extrabold px-3 py-1.5 rounded-xl bg-duo-purple/10 text-duo-purple hover:bg-duo-purple/20 disabled:opacity-40"
              >
                {busy === "summary" ? "要約中…" : "AI要約"}
              </button>
            )}
            {m.transcript_text && (
              <button
                onClick={() => run("diagnose")}
                disabled={busy !== null}
                className="text-[10px] font-extrabold px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
                title="議事録を候補者情報の5項目に整形します"
              >
                {busy === "diagnose" ? "整形中…" : diagnosis ? "📋 整形を更新" : "📋 候補者情報を整形"}
              </button>
            )}
            {isMine && (
              <button
                onClick={() => onDelete(m.id, m.title)}
                className="ml-auto text-[10px] font-extrabold px-3 py-1.5 rounded-xl bg-duo-red/10 text-duo-red hover:bg-duo-red/20"
              >
                削除
              </button>
            )}
          </div>

          {err && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
              <p className="text-[11px] font-bold text-red-700">{err}</p>
            </div>
          )}

          {/* 📊 トーク傾向（このツールの中核） */}
          {m.transcript_text && (
            <TalkTendencyPanel
              transcript={m.transcript_text}
              consultant={m.consultant_name || currentUser}
              onJump={jumpToTranscript}
            />
          )}

          {/* 💬 フィードバック（誰でも入力できる） */}
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
                : "気づいたことを一言でOK。例: 冒頭の要約が丁寧／年収の掘り下げが浅い"}
              className="w-full rounded-xl border-2 border-[#e5e5e5] px-3 py-2 text-xs font-bold text-[#4b4b4b] h-16 focus:border-[#fbbf24] focus:outline-none resize-none"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={saveFeedback}
                disabled={!fbText.trim() || fbSaving}
                className="btn-duo !px-4 !py-1.5 !text-[10px] text-white disabled:opacity-40"
                style={{ backgroundColor: "#f59e0b", borderBottomColor: "#d97706" }}
              >
                {fbSaving ? "保存中..." : m.leader_feedback ? "上書き保存" : "コメントを保存"}
              </button>
              {["深掘りが浅い", "説明が長い", "質問が良い", "次アクションが曖昧", "共感が丁寧"].map((tpl) => (
                <button
                  key={tpl}
                  onClick={() => setFbText((p) => (p ? `${p} / ${tpl}` : tpl))}
                  className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white border border-[#fde68a] text-[#92400e] hover:bg-[#fef3c7]"
                >
                  + {tpl}
                </button>
              ))}
            </div>
          </div>

          {/* 📋 候補者情報まとめ（整形した場合のみ） */}
          {diagnosis && (
            <details className="rounded-xl bg-emerald-50 border border-emerald-200 p-3">
              <summary className="cursor-pointer select-none text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider">
                📋 候補者情報まとめ（LARK提出形式）
              </summary>
              <div className="mt-2 text-[11px] font-bold text-[#4b4b4b] leading-relaxed whitespace-pre-wrap">
                {diagnosis}
              </div>
            </details>
          )}

          {/* AI要約 */}
          {m.summary && (
            <div className="rounded-xl bg-[#f7f7f7] p-3 prose prose-sm max-w-none text-xs text-[#4b4b4b]">
              <ReactMarkdown>{m.summary}</ReactMarkdown>
            </div>
          )}

          {/* 議事録本文 */}
          {m.transcript_text && (
            <details ref={detailsRef} className="rounded-xl bg-[#fafafa] border border-[#e5e5e5] p-3">
              <summary className="cursor-pointer text-[10px] font-extrabold text-[#777] uppercase tracking-wider select-none">
                📝 議事録 ({m.transcript_text.length.toLocaleString()} 字)
              </summary>
              <pre
                ref={preRef}
                className="mt-2 whitespace-pre-wrap text-[11px] font-bold text-[#4b4b4b] leading-relaxed max-h-96 overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: highlighted || escapeHtml(m.transcript_text) }}
              />
            </details>
          )}
        </div>
      )}
    </div>
  );
}
