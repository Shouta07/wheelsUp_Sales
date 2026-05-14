import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchLeaderStrengths, MEETING_TYPE_LABELS, type MeetingType } from "../../api/client";

// 1on1 (2026-05-14) で合意した「初回診断のCVR向上 = リーダーの強み可視化で若手育成」を担う
// パネル。リーダー (小林) の 5軸平均、若手とのギャップ、リーダーが多用するキーフレーズを表示する。

const AXIS_LABELS: Record<string, { label: string; color: string }> = {
  needs: { label: "ニーズ深掘り", color: "#1CB0F6" },
  proposal: { label: "提案力", color: "#58CC02" },
  trust: { label: "信頼構築", color: "#CE82FF" },
  closing: { label: "クロージング", color: "#FF9600" },
  intel: { label: "情報収集", color: "#FF4B4B" },
};

const TYPE_OPTIONS: MeetingType[] = ["first_diagnosis", "second", "interview_prep", "closing"];

export default function LeaderStrengthsPanel() {
  const [type, setType] = useState<MeetingType>("first_diagnosis");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["leader-strengths", type],
    queryFn: () => fetchLeaderStrengths(type),
    retry: false,
  });

  return (
    <div className="card-duo p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-lg bg-duo-orange flex items-center justify-center"
            style={{ borderBottom: "2px solid #d97706" }}
          >
            <span className="text-white text-sm">👑</span>
          </div>
          <div>
            <span className="text-base font-extrabold text-[#4b4b4b] block leading-tight">
              リーダーの強み
            </span>
            <span className="text-[10px] font-bold text-[#afafaf]">
              小林の{MEETING_TYPE_LABELS[type]}を 5軸で集計 → 強み軸 / ギャップを可視化
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {TYPE_OPTIONS.map((t) => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold transition-colors ${
                type === t
                  ? "bg-duo-orange text-white"
                  : "bg-[#f7f7f7] text-[#777] hover:bg-[#e5e5e5]"
              }`}
            >
              {MEETING_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <p className="text-xs font-bold text-[#afafaf] py-4 text-center">読み込み中...</p>
      )}
      {isError && (
        <p className="text-xs font-bold text-duo-red py-4 text-center">
          集計に失敗しました
        </p>
      )}

      {data && !data.leader && (
        <div className="rounded-2xl bg-[#fffbeb] border border-[#fde68a] p-4 text-center">
          <p className="text-xs font-extrabold text-[#92400e]">
            リーダー({MEETING_TYPE_LABELS[type]})のスコア付き面談がまだありません
          </p>
          <p className="text-[10px] font-bold text-[#92400e]/70 mt-1">
            まず小林の{MEETING_TYPE_LABELS[type]}を追加して採点を蓄積しましょう
          </p>
        </div>
      )}

      {data?.leader && (
        <div className="space-y-3">
          {data.minimum_sample_warning && (
            <div className="rounded-lg bg-duo-orange/10 border border-duo-orange/30 px-3 py-1.5">
              <p className="text-[10px] font-bold text-duo-orange leading-relaxed">
                ⚠️ サンプル{data.leader.count}件のみ。傾向把握には20件以上の蓄積を推奨
              </p>
            </div>
          )}

          {/* スコア集計 */}
          <div className="space-y-1.5">
            {data.strengths.map((s) => {
              const info = AXIS_LABELS[s.axis];
              if (!info) return null;
              const leaderPct = (s.leader_avg / 10) * 100;
              const memberPct = s.member_avg != null ? (s.member_avg / 10) * 100 : null;
              return (
                <div key={s.axis}>
                  <div className="flex items-center justify-between text-[10px] font-bold mb-0.5">
                    <span style={{ color: info.color }}>{info.label}</span>
                    <span className="text-[#777]">
                      <span className="font-black" style={{ color: info.color }}>
                        {s.leader_avg.toFixed(1)}
                      </span>
                      {s.member_avg != null && (
                        <>
                          <span className="mx-1 text-[#ccc]">vs</span>
                          <span className="font-black text-[#4b4b4b]">
                            {s.member_avg.toFixed(1)}
                          </span>
                          {s.gap != null && s.gap > 0 && (
                            <span className="ml-1 text-duo-red font-black">
                              -{s.gap.toFixed(1)}
                            </span>
                          )}
                        </>
                      )}
                    </span>
                  </div>
                  <div className="relative h-3 bg-[#f7f7f7] rounded-full overflow-hidden">
                    <div
                      className="absolute h-full rounded-full transition-all duration-700"
                      style={{ width: `${leaderPct}%`, backgroundColor: info.color, opacity: 0.4 }}
                    />
                    {memberPct != null && (
                      <div
                        className="absolute top-0 h-full w-1 bg-[#4b4b4b]"
                        style={{ left: `${memberPct}%` }}
                        title={`${data.member?.name}平均: ${s.member_avg?.toFixed(1)}`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 伸ばすべき軸 */}
          {data.top_gap && (data.top_gap.gap ?? 0) > 0 && (
            <div className="rounded-2xl bg-duo-red/10 border-2 border-duo-red/20 p-3">
              <div className="text-[10px] font-extrabold text-duo-red uppercase tracking-wider mb-1">
                次に伸ばすべき軸
              </div>
              <p className="text-xs font-extrabold text-[#4b4b4b]">
                <span style={{ color: AXIS_LABELS[data.top_gap.axis]?.color }}>
                  {AXIS_LABELS[data.top_gap.axis]?.label}
                </span>
                {" "}でリーダーに <span className="text-duo-red">{data.top_gap.gap?.toFixed(1)}点</span> 差。
                次の{MEETING_TYPE_LABELS[type]}でこの軸を意識して臨むと CVR が動きやすい。
              </p>
            </div>
          )}

          {/* リーダーの決めゼリフ */}
          {data.key_phrases.length > 0 && (
            <div>
              <div className="text-[10px] font-extrabold text-[#777] uppercase tracking-wider mb-1.5">
                リーダーが繰り返し使うフレーズ
              </div>
              <div className="space-y-1.5">
                {data.key_phrases.slice(0, 8).map((p, i) => {
                  const info = AXIS_LABELS[p.axis];
                  if (!info) return null;
                  return (
                    <div key={i} className="rounded-lg bg-[#fafafa] border border-[#e5e5e5] p-2">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span
                          className="text-[9px] font-extrabold px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: info.color + "20", color: info.color }}
                        >
                          {info.label}
                        </span>
                        <span className="text-[11px] font-extrabold text-[#4b4b4b]">
                          「{p.phrase}」
                        </span>
                      </div>
                      {p.example && (
                        <p className="text-[10px] font-bold text-[#777] leading-relaxed pl-1">
                          例: {p.example}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* メタ情報 */}
          <div className="text-[10px] font-bold text-[#afafaf] text-center pt-1">
            リーダー {data.leader.count} 件
            {data.member && ` · ${data.member.name} ${data.member.count} 件`}
          </div>
        </div>
      )}
    </div>
  );
}
