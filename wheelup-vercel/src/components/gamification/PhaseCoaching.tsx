import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { getContextualCoaching } from "../../api/client";

const PHASE_LABELS: Record<number, { title: string; icon: string; color: string; dark: string }> = {
  1: { title: "準備のコーチング", icon: "📋", color: "#CE82FF", dark: "#a85fd6" },
  2: { title: "面談のコーチング", icon: "🎯", color: "#1CB0F6", dark: "#1899d6" },
  3: { title: "直後対応のコーチング", icon: "⚡", color: "#FF9600", dark: "#d97f00" },
  4: { title: "クロージングのコーチング", icon: "🏆", color: "#58CC02", dark: "#46a302" },
};

interface Props {
  phase: number;
  candidateId?: string;
  companyId?: string;
  dealId?: string;
  candidateName?: string;
  companyName?: string;
}

export default function PhaseCoaching({ phase, candidateId, companyId, dealId, candidateName, companyName }: Props) {
  const [coaching, setCoaching] = useState<string | null>(null);
  const [situation, setSituation] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const info = PHASE_LABELS[phase] || PHASE_LABELS[1];

  const handleAsk = async () => {
    setLoading(true);
    try {
      const res = await getContextualCoaching({
        phase,
        candidate_id: candidateId,
        company_id: companyId,
        deal_id: dealId,
        current_situation: situation || undefined,
      });
      setCoaching(res.coaching);
    } catch {
      setCoaching("コーチングの取得に失敗しました。面談データがあるか確認してください。");
    }
    setLoading(false);
  };

  return (
    <div className="card-duo overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-[#f7f7f7] transition-colors"
      >
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
            style={{ backgroundColor: info.color, borderBottom: `2px solid ${info.dark}` }}
          >
            <span>{info.icon}</span>
          </div>
          <span className="text-sm font-extrabold text-[#4b4b4b]">
            {info.title}
            {candidateName && companyName && (
              <span className="text-xs font-bold text-[#afafaf] ml-2">
                {candidateName} × {companyName}
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!coaching && (
            <span className="text-[10px] font-bold text-white px-2 py-0.5 rounded-full" style={{ backgroundColor: info.color }}>
              リーダーならどうする？
            </span>
          )}
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="#afafaf"
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          >
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
          </svg>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={situation}
              onChange={(e) => setSituation(e.target.value)}
              placeholder="今困っていること（例: 年収交渉で候補者が迷っている）"
              className="flex-1 rounded-xl border-2 border-[#e5e5e5] px-3 py-2 text-sm font-bold text-[#4b4b4b] focus:border-duo-purple focus:outline-none"
              onKeyDown={(e) => e.key === "Enter" && handleAsk()}
            />
            <button
              onClick={handleAsk}
              disabled={loading}
              className="btn-duo !px-4 !py-2 !text-xs text-white shrink-0"
              style={{ backgroundColor: info.color, borderBottomColor: info.dark }}
            >
              {loading ? "分析中..." : "AIに聞く"}
            </button>
          </div>

          {coaching && (
            <div className="rounded-2xl border-2 border-[#e5e5e5] overflow-hidden">
              <div className="px-4 py-2 flex items-center gap-2" style={{ backgroundColor: `${info.color}10` }}>
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px]" style={{ backgroundColor: info.color }}>
                  <span className="text-white font-black">AI</span>
                </div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: info.color }}>
                  リーダーの視点でアドバイス
                </span>
              </div>
              <div className="px-4 py-3 prose prose-sm max-w-none text-sm text-[#4b4b4b] leading-relaxed">
                <ReactMarkdown>{coaching}</ReactMarkdown>
              </div>
            </div>
          )}

          {!coaching && !loading && (
            <div className="rounded-2xl bg-[#f7f7f7] p-4 text-center">
              <p className="text-xs font-bold text-[#afafaf]">
                この案件の状況をAIが分析し、リーダーならどう対応するかアドバイスします
              </p>
              <p className="text-[10px] text-[#d0d0d0] mt-1">
                候補者・企業・過去の面談データを踏まえた具体的なアドバイスが得られます
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
