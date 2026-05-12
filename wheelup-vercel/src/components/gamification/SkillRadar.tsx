import { useQuery } from "@tanstack/react-query";
import { useGamification } from "../../gamification/GamificationProvider";
import { fetchMeetings, type MeetingTranscript, type MeetingScore } from "../../api/client";

const AXES = [
  { key: "needs", label: "ニーズ把握", angle: -90 },
  { key: "proposal", label: "提案力", angle: -18 },
  { key: "intel", label: "情報収集", angle: 54 },
  { key: "closing", label: "クロージング", angle: 126 },
  { key: "trust", label: "信頼構築", angle: 198 },
] as const;

function polarToXY(angle: number, r: number, cx: number, cy: number) {
  const rad = (angle * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function buildPolygon(scores: Record<string, number>, maxR: number, cx: number, cy: number) {
  return AXES.map(({ key, angle }) => {
    const val = scores[key] || 0;
    return polarToXY(angle, (val / 10) * maxR, cx, cy);
  });
}

function avgScores(meetings: MeetingTranscript[]): Record<string, number> | null {
  const scored = meetings.filter((m) => m.score_data?.scores);
  if (scored.length === 0) return null;
  const sum: Record<string, number> = { needs: 0, proposal: 0, trust: 0, closing: 0, intel: 0 };
  for (const m of scored) {
    const s = m.score_data!.scores;
    sum.needs += s.needs;
    sum.proposal += s.proposal;
    sum.trust += s.trust;
    sum.closing += s.closing;
    sum.intel += s.intel;
  }
  const n = scored.length;
  return {
    needs: Math.round((sum.needs / n) * 10) / 10,
    proposal: Math.round((sum.proposal / n) * 10) / 10,
    trust: Math.round((sum.trust / n) * 10) / 10,
    closing: Math.round((sum.closing / n) * 10) / 10,
    intel: Math.round((sum.intel / n) * 10) / 10,
  };
}

export default function SkillRadar() {
  const { currentUser } = useGamification();

  const { data: myData } = useQuery({
    queryKey: ["meetings", "mine", currentUser],
    queryFn: () => fetchMeetings(undefined, undefined, currentUser, false),
    enabled: !!currentUser,
  });

  const { data: leaderData } = useQuery({
    queryKey: ["meetings", "leader"],
    queryFn: () => fetchMeetings(undefined, undefined, undefined, true),
  });

  const myAvg = avgScores(myData?.transcripts || []);
  const leaderAvg = avgScores(leaderData?.transcripts || []);

  const cx = 90, cy = 90, maxR = 70;

  const hasData = myAvg || leaderAvg;

  return (
    <div className="card-duo p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-duo-purple flex items-center justify-center" style={{ borderBottom: "2px solid #a85fd6" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
        </div>
        <span className="text-base font-extrabold text-[#4b4b4b]">面談スキル</span>
      </div>

      {!hasData ? (
        <div className="rounded-2xl bg-[#f7f7f7] p-4 text-center">
          <p className="text-xs font-bold text-[#afafaf]">面談を記録して採点すると、5軸のスキル分析が表示されます</p>
        </div>
      ) : (
        <>
          <svg viewBox="0 0 180 180" className="w-full max-w-[220px] mx-auto">
            {/* Grid lines */}
            {[2, 4, 6, 8, 10].map((level) => {
              const pts = AXES.map(({ angle }) => polarToXY(angle, (level / 10) * maxR, cx, cy));
              return (
                <polygon
                  key={level}
                  points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none" stroke="#e5e5e5" strokeWidth="0.5"
                />
              );
            })}

            {/* Axis lines */}
            {AXES.map(({ key, angle }) => {
              const end = polarToXY(angle, maxR, cx, cy);
              return <line key={key} x1={cx} y1={cy} x2={end.x} y2={end.y} stroke="#e5e5e5" strokeWidth="0.5" />;
            })}

            {/* Leader polygon */}
            {leaderAvg && (() => {
              const pts = buildPolygon(leaderAvg, maxR, cx, cy);
              return (
                <polygon
                  points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="rgba(255,150,0,0.1)" stroke="#FF9600" strokeWidth="1.5" strokeDasharray="4,2"
                />
              );
            })()}

            {/* My polygon */}
            {myAvg && (() => {
              const pts = buildPolygon(myAvg, maxR, cx, cy);
              return (
                <polygon
                  points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="rgba(28,176,246,0.15)" stroke="#1CB0F6" strokeWidth="2"
                />
              );
            })()}

            {/* Labels */}
            {AXES.map(({ key, label, angle }) => {
              const pos = polarToXY(angle, maxR + 14, cx, cy);
              return (
                <text key={key} x={pos.x} y={pos.y} textAnchor="middle" dominantBaseline="middle"
                  className="text-[8px] font-bold fill-[#777]">
                  {label}
                </text>
              );
            })}
          </svg>

          {/* Legend */}
          <div className="flex justify-center gap-4 mt-2">
            {myAvg && (
              <div className="flex items-center gap-1">
                <div className="w-3 h-1.5 rounded-full bg-duo-blue" />
                <span className="text-[10px] font-bold text-[#777]">自分</span>
              </div>
            )}
            {leaderAvg && (
              <div className="flex items-center gap-1">
                <div className="w-3 h-1.5 rounded-full bg-duo-orange" style={{ opacity: 0.6 }} />
                <span className="text-[10px] font-bold text-[#777]">リーダー</span>
              </div>
            )}
          </div>

          {/* Gap analysis */}
          {myAvg && leaderAvg && (
            <div className="mt-3 space-y-1.5">
              {AXES.map(({ key, label }) => {
                const mine = myAvg[key];
                const leader = leaderAvg[key];
                const gap = mine - leader;
                return (
                  <div key={key} className="flex items-center justify-between text-[10px]">
                    <span className="font-bold text-[#777]">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-duo-blue">{mine}</span>
                      <span className="text-[#d0d0d0]">vs</span>
                      <span className="font-bold text-duo-orange">{leader}</span>
                      <span className={`font-black ${gap >= 0 ? "text-duo-green" : "text-duo-red"}`}>
                        {gap >= 0 ? `+${gap}` : gap}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
