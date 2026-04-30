import { useState } from "react";
import { scoreMeeting, type MeetingScore } from "../../api/client";

const DIMENSIONS = [
  { key: "needs", label: "ニーズ把握", color: "#1CB0F6" },
  { key: "proposal", label: "提案力", color: "#58CC02" },
  { key: "trust", label: "信頼構築", color: "#CE82FF" },
  { key: "closing", label: "クロージング", color: "#FF9600" },
  { key: "intel", label: "情報収集", color: "#FF4B4B" },
] as const;

const GRADE_STYLES: Record<string, { bg: string; text: string }> = {
  S: { bg: "#FFC800", text: "#7a5a00" },
  A: { bg: "#58CC02", text: "#fff" },
  B: { bg: "#1CB0F6", text: "#fff" },
  C: { bg: "#FF9600", text: "#fff" },
  D: { bg: "#FF4B4B", text: "#fff" },
};

interface Props {
  meetingId: string;
  meetingTitle: string;
}

export default function MeetingScoreCard({ meetingId, meetingTitle }: Props) {
  const [score, setScore] = useState<MeetingScore | null>(null);
  const [loading, setLoading] = useState(false);

  const handleScore = async () => {
    setLoading(true);
    try {
      const res = await scoreMeeting(meetingId);
      setScore(res);
    } catch {
      setScore(null);
    }
    setLoading(false);
  };

  if (!score) {
    return (
      <button
        onClick={handleScore}
        disabled={loading}
        className="btn-duo !px-3 !py-1.5 !text-[10px] !rounded-xl text-white shrink-0"
        style={{ backgroundColor: "#FF9600", borderBottomColor: "#d97f00" }}
      >
        {loading ? "採点中..." : "面談を採点"}
      </button>
    );
  }

  const gradeStyle = GRADE_STYLES[score.grade] || GRADE_STYLES.C;

  return (
    <div className="rounded-2xl border-2 border-[#e5e5e5] overflow-hidden mt-2">
      <div className="px-4 py-3 bg-[#f7f7f7] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black"
            style={{ backgroundColor: gradeStyle.bg, color: gradeStyle.text, borderBottom: "2px solid rgba(0,0,0,0.15)" }}
          >
            {score.grade}
          </div>
          <div>
            <p className="text-xs font-extrabold text-[#4b4b4b]">{meetingTitle}</p>
            <p className="text-[10px] font-bold text-[#afafaf]">{score.total}/50点</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        {DIMENSIONS.map(({ key, label, color }) => {
          const val = score.scores[key as keyof typeof score.scores];
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-[#777] w-16 shrink-0">{label}</span>
              <div className="flex-1 h-3 bg-[#e5e5e5] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${val * 10}%`, backgroundColor: color }}
                />
              </div>
              <span className="text-xs font-black w-5 text-right" style={{ color }}>{val}</span>
            </div>
          );
        })}
      </div>

      {score.strengths.length > 0 && (
        <div className="px-4 pb-2">
          <div className="text-[10px] font-extrabold text-duo-green uppercase tracking-wider mb-1">強み</div>
          <div className="flex flex-wrap gap-1">
            {score.strengths.map((s) => (
              <span key={s} className="text-[10px] font-bold text-duo-green bg-duo-green/10 px-2 py-0.5 rounded-lg">{s}</span>
            ))}
          </div>
        </div>
      )}

      {score.improvements.length > 0 && (
        <div className="px-4 pb-2">
          <div className="text-[10px] font-extrabold text-duo-orange uppercase tracking-wider mb-1">改善ポイント</div>
          <div className="flex flex-wrap gap-1">
            {score.improvements.map((s) => (
              <span key={s} className="text-[10px] font-bold text-duo-orange bg-duo-orange/10 px-2 py-0.5 rounded-lg">{s}</span>
            ))}
          </div>
        </div>
      )}

      {score.leader_would && (
        <div className="mx-4 mb-3 rounded-xl bg-duo-purple/5 border border-duo-purple/20 p-2.5">
          <div className="text-[10px] font-extrabold text-duo-purple uppercase tracking-wider mb-0.5">リーダーならこうしてた</div>
          <p className="text-xs font-bold text-[#4b4b4b] leading-relaxed">{score.leader_would}</p>
        </div>
      )}
    </div>
  );
}
