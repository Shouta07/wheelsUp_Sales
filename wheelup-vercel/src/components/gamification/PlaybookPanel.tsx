import { useState } from "react";
import { extractPlaybook, type PlaybookEntry } from "../../api/client";

export default function PlaybookPanel() {
  const [entries, setEntries] = useState<PlaybookEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [leaderName, setLeaderName] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [generated, setGenerated] = useState(false);

  const handleExtract = async () => {
    setLoading(true);
    try {
      const res = await extractPlaybook(leaderName || undefined);
      setEntries(res.playbook);
      setGenerated(true);
    } catch {
      setEntries([]);
    }
    setLoading(false);
  };

  return (
    <div className="card-duo p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-duo-orange flex items-center justify-center" style={{ borderBottom: "2px solid #d97f00" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>
        </div>
        <span className="text-base font-extrabold text-[#4b4b4b]">リーダープレイブック</span>
      </div>

      <p className="text-xs font-bold text-[#afafaf] mb-3">
        リーダーの面談記録から「この場面ではこう話す」を自動抽出
      </p>

      {!generated && (
        <div>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={leaderName}
              onChange={(e) => setLeaderName(e.target.value)}
              placeholder="リーダー名（空欄で全員）"
              className="flex-1 rounded-xl border-2 border-[#e5e5e5] px-3 py-2 text-sm font-bold text-[#4b4b4b] focus:border-duo-orange focus:outline-none"
            />
            <button
              onClick={handleExtract}
              disabled={loading}
              className="btn-duo btn-duo-green !px-4 !py-2 !text-xs shrink-0"
            >
              {loading ? "分析中..." : "プレイブック生成"}
            </button>
          </div>
          <div className="rounded-2xl bg-[#f7f7f7] p-4 text-center">
            <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-duo-orange/10 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#FF9600"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>
            </div>
            <p className="text-sm font-bold text-[#777]">面談記録からリーダーの対応パターンをAIが分析</p>
            <p className="text-xs text-[#afafaf] mt-1">「年収交渉の切り返し」「温度感が低い時の対処」など</p>
          </div>
        </div>
      )}

      {entries.length > 0 && (
        <div className="space-y-2">
          {entries.map((entry) => {
            const isOpen = expanded === entry.situation;
            return (
              <div key={entry.situation} className="rounded-2xl border-2 border-[#e5e5e5] overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : entry.situation)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-[#f7f7f7] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-duo-orange shrink-0" />
                    <span className="text-sm font-bold text-[#4b4b4b]">{entry.situation}</span>
                  </div>
                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="#afafaf"
                    className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
                  >
                    <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
                  </svg>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-3">
                    <div>
                      <div className="text-[10px] font-extrabold text-duo-red uppercase tracking-wider mb-1">トリガー</div>
                      <p className="text-xs font-bold text-[#777]">{entry.trigger}</p>
                    </div>
                    <div>
                      <div className="text-[10px] font-extrabold text-duo-green uppercase tracking-wider mb-1">リーダーの対応</div>
                      <p className="text-xs font-bold text-[#4b4b4b] leading-relaxed">{entry.leader_approach}</p>
                    </div>
                    <div>
                      <div className="text-[10px] font-extrabold text-duo-blue uppercase tracking-wider mb-1">使えるフレーズ</div>
                      <div className="flex flex-wrap gap-1.5">
                        {entry.key_phrases.map((p) => (
                          <span key={p} className="text-xs font-bold text-duo-blue bg-duo-blue/8 px-2 py-1 rounded-lg">
                            「{p}」
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-xl bg-duo-red/5 border border-duo-red/20 p-2.5">
                      <div className="text-[10px] font-extrabold text-duo-red uppercase tracking-wider mb-0.5">NG行動</div>
                      <p className="text-xs font-bold text-[#777]">{entry.avoid}</p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          <button
            onClick={() => { setGenerated(false); setEntries([]); }}
            className="w-full text-xs font-bold text-[#afafaf] hover:text-[#777] py-2"
          >
            再生成する
          </button>
        </div>
      )}
    </div>
  );
}
