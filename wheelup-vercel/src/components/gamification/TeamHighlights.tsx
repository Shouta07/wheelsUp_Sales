import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchMeetings, type MeetingTranscript } from "../../api/client";

const DIM_LABELS: Record<string, string> = {
  needs: "ニーズ把握",
  proposal: "提案力",
  trust: "信頼構築",
  closing: "クロージング",
  intel: "情報収集",
};

const DIM_EMOJI: Record<string, string> = {
  needs: "🎯",
  proposal: "💡",
  trust: "🤝",
  closing: "🏁",
  intel: "🔍",
};

interface MemberStat {
  name: string;
  meetingCount: number;
  avgTotal: number;
  bestDim: string;
  bestDimAvg: number;
  streakDays: number;
  trend: number;
}

function buildTeamStats(meetings: MeetingTranscript[]): MemberStat[] {
  const scored = meetings.filter((m) => m.score_data?.scores && m.consultant_name);
  const byMember = new Map<string, MeetingTranscript[]>();
  for (const m of scored) {
    const name = m.consultant_name!;
    if (!byMember.has(name)) byMember.set(name, []);
    byMember.get(name)!.push(m);
  }

  const stats: MemberStat[] = [];
  for (const [name, ms] of byMember) {
    const sorted = [...ms].sort((a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime());
    const avgTotal = Math.round(sorted.reduce((s, m) => s + m.score_data!.total, 0) / sorted.length);

    const dimSums: Record<string, number> = { needs: 0, proposal: 0, trust: 0, closing: 0, intel: 0 };
    for (const m of sorted) {
      const s = m.score_data!.scores;
      for (const k of Object.keys(dimSums)) dimSums[k] += s[k as keyof typeof s];
    }
    const bestEntry = Object.entries(dimSums).sort((a, b) => b[1] - a[1])[0];
    const bestDim = bestEntry[0];
    const bestDimAvg = Math.round((bestEntry[1] / sorted.length) * 10) / 10;

    // Streak: consecutive days with scored meetings
    let streakDays = 0;
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const day = new Date(today);
      day.setDate(day.getDate() - i);
      const dayStr = day.toISOString().slice(0, 10);
      const hasEntry = sorted.some((m) => m.recorded_at.slice(0, 10) === dayStr);
      if (hasEntry) streakDays++;
      else if (i > 0) break;
    }

    // Trend: latest 3 vs previous 3
    let trend = 0;
    if (sorted.length >= 4) {
      const recent = sorted.slice(0, 3).reduce((s, m) => s + m.score_data!.total, 0) / 3;
      const older = sorted.slice(3, 6).reduce((s, m) => s + m.score_data!.total, 0) / Math.min(3, sorted.length - 3);
      trend = Math.round(recent - older);
    }

    stats.push({ name, meetingCount: sorted.length, avgTotal, bestDim, bestDimAvg, streakDays, trend });
  }

  return stats.sort((a, b) => b.avgTotal - a.avgTotal);
}

export default function TeamHighlights() {
  const { data } = useQuery({
    queryKey: ["meetings", "all-consultants"],
    queryFn: () => fetchMeetings(undefined, undefined, undefined, false),
  });

  const stats = useMemo(() => buildTeamStats(data?.transcripts || []), [data]);

  if (stats.length === 0) {
    return (
      <div className="card-duo p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-duo-blue flex items-center justify-center" style={{ borderBottom: "2px solid #1899d6" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
          </div>
          <span className="text-base font-extrabold text-[#4b4b4b]">チーム</span>
        </div>
        <div className="rounded-2xl bg-[#f7f7f7] p-4 text-center">
          <p className="text-xs font-bold text-[#afafaf]">メンバーのデータが貯まるとチームハイライトが表示されます</p>
        </div>
      </div>
    );
  }

  // Per-dimension MVP
  const dimMVPs: { dim: string; member: MemberStat }[] = [];
  const dims = ["needs", "proposal", "trust", "closing", "intel"];
  for (const dim of dims) {
    const mvp = stats.find((s) => s.bestDim === dim);
    if (mvp) dimMVPs.push({ dim, member: mvp });
  }

  const teamAvg = Math.round(stats.reduce((s, m) => s + m.avgTotal, 0) / stats.length);
  const topStreak = [...stats].sort((a, b) => b.streakDays - a.streakDays)[0];

  return (
    <div className="card-duo p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-duo-blue flex items-center justify-center" style={{ borderBottom: "2px solid #1899d6" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
        </div>
        <span className="text-base font-extrabold text-[#4b4b4b]">チーム</span>
        <span className="ml-auto text-[10px] font-bold text-[#afafaf]">平均 {teamAvg}/50</span>
      </div>

      {/* Per-dimension MVPs */}
      {dimMVPs.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {dimMVPs.map(({ dim, member }) => (
            <div key={dim} className="flex items-center gap-2 rounded-xl bg-[#f7f7f7] px-3 py-2">
              <span className="text-sm">{DIM_EMOJI[dim]}</span>
              <span className="text-[10px] font-bold text-[#afafaf] w-16 shrink-0">{DIM_LABELS[dim]}</span>
              <span className="text-xs font-extrabold text-[#4b4b4b]">{member.name}</span>
              <span className="ml-auto text-[10px] font-black text-duo-blue">{member.bestDimAvg}点</span>
            </div>
          ))}
        </div>
      )}

      {/* Member cards */}
      <div className="space-y-2">
        {stats.map((member, i) => (
          <div key={member.name} className="flex items-center gap-2.5 rounded-xl border border-[#e5e5e5] px-3 py-2">
            <div className="w-7 h-7 rounded-full bg-duo-blue/10 flex items-center justify-center text-xs font-black text-duo-blue shrink-0">
              {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : member.name[0]}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-extrabold text-[#4b4b4b]">{member.name}</span>
                {member.streakDays >= 3 && (
                  <span className="text-[9px] font-bold text-duo-orange bg-duo-orange/10 px-1 py-0.5 rounded">
                    🔥{member.streakDays}日
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-bold text-[#afafaf]">{member.meetingCount}面談</span>
                <span className="text-[10px] font-bold text-[#afafaf]">平均{member.avgTotal}点</span>
                {member.trend !== 0 && (
                  <span className={`text-[10px] font-black ${member.trend > 0 ? "text-duo-green" : "text-duo-red"}`}>
                    {member.trend > 0 ? `↑+${member.trend}` : `↓${member.trend}`}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[9px] font-bold text-[#afafaf]">得意</span>
              <div className="text-[10px] font-extrabold text-duo-purple">{DIM_LABELS[member.bestDim]}</div>
            </div>
          </div>
        ))}
      </div>

      {topStreak && topStreak.streakDays >= 2 && (
        <div className="mt-3 rounded-xl bg-duo-orange/5 border border-duo-orange/20 p-2.5 text-center">
          <span className="text-xs font-bold text-duo-orange">
            🔥 {topStreak.name}が{topStreak.streakDays}日連続記録中！
          </span>
        </div>
      )}
    </div>
  );
}
