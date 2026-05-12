import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGamification } from "../../gamification/GamificationProvider";
import { fetchMeetings, type MeetingTranscript, type MeetingScore } from "../../api/client";

interface Notification {
  id: string;
  icon: string;
  text: string;
  subtext?: string;
  color: string;
  meetingId?: string;
  timestamp: Date;
}

function generateNotifications(
  myMeetings: MeetingTranscript[],
  leaderMeetings: MeetingTranscript[],
): Notification[] {
  const notifications: Notification[] = [];
  const scored = myMeetings.filter((m) => m.score_data?.scores);
  const leaderScored = leaderMeetings.filter((m) => m.score_data?.scores);

  if (scored.length === 0) return [];

  const latest = scored[0];
  const latestScore = latest.score_data!;

  // 1. Latest score announcement — curiosity gap
  notifications.push({
    id: `score-${latest.id}`,
    icon: gradeEmoji(latestScore.grade),
    text: `${latest.title}の採点が完了`,
    subtext: `${latestScore.grade}ランク (${latestScore.total}/50) — タップして根拠を確認`,
    color: gradeColor(latestScore.grade),
    meetingId: latest.id,
    timestamp: new Date(latest.recorded_at),
  });

  // 2. Best dimension highlight
  const scores = latestScore.scores;
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  const dimLabel = DIM_LABELS[best[0]] || best[0];
  if (best[1] >= 7) {
    notifications.push({
      id: `strength-${latest.id}`,
      icon: "💪",
      text: `${dimLabel}が${best[1]}点！ あなたの武器`,
      subtext: latestScore.evidence?.[best[0] as keyof typeof latestScore.evidence] || undefined,
      color: "#58CC02",
      meetingId: latest.id,
      timestamp: new Date(latest.recorded_at),
    });
  }

  // 3. Biggest gap vs leader
  if (leaderScored.length > 0) {
    const leaderAvg = avgScores(leaderScored);
    if (leaderAvg) {
      const gaps = Object.entries(scores).map(([k, v]) => ({
        key: k,
        gap: v - (leaderAvg[k] || 0),
      }));
      const biggestGap = gaps.sort((a, b) => a.gap - b.gap)[0];
      if (biggestGap.gap < -1) {
        const gapLabel = DIM_LABELS[biggestGap.key] || biggestGap.key;
        notifications.push({
          id: `gap-${latest.id}`,
          icon: "📊",
          text: `${gapLabel}: リーダーとの差 ${biggestGap.gap}点`,
          subtext: "プレイブックを見て改善ポイントを確認しよう",
          color: "#FF9600",
          meetingId: latest.id,
          timestamp: new Date(latest.recorded_at),
        });
      }

      // Winning against leader
      const winning = gaps.filter((g) => g.gap > 0);
      if (winning.length > 0) {
        const winLabel = winning.map((w) => DIM_LABELS[w.key]).join("・");
        notifications.push({
          id: `win-${latest.id}`,
          icon: "🏆",
          text: `${winLabel}でリーダー超え！`,
          subtext: `${winning.length}軸でリーダー平均を上回っている`,
          color: "#FFC800",
          timestamp: new Date(latest.recorded_at),
        });
      }
    }
  }

  // 4. Improvement trend (if 2+ scored meetings)
  if (scored.length >= 2) {
    const prev = scored[1].score_data!;
    const diff = latestScore.total - prev.total;
    if (diff > 0) {
      notifications.push({
        id: `trend-${latest.id}`,
        icon: "📈",
        text: `前回比 +${diff}点アップ！`,
        subtext: "この調子でリーダーに近づいてる",
        color: "#58CC02",
        timestamp: new Date(latest.recorded_at),
      });
    } else if (diff < -3) {
      notifications.push({
        id: `dip-${latest.id}`,
        icon: "🔔",
        text: `前回から${diff}点ダウン — 何が変わった？`,
        subtext: "タップして比較してみよう",
        color: "#FF4B4B",
        meetingId: latest.id,
        timestamp: new Date(latest.recorded_at),
      });
    }
  }

  // 5. Streak/count milestone
  if (scored.length === 3) {
    notifications.push({
      id: "milestone-3",
      icon: "🔥",
      text: "3面談クリア！パターンが見えてきた",
      subtext: "レーダーチャートの精度が上がったよ",
      color: "#FF9600",
      timestamp: new Date(scored[0].recorded_at),
    });
  } else if (scored.length === 5) {
    notifications.push({
      id: "milestone-5",
      icon: "⭐",
      text: "5面談達成！スキル分析が安定してきた",
      color: "#FFC800",
      timestamp: new Date(scored[0].recorded_at),
    });
  }

  // 6. Pending unscored meetings hint
  const unscored = myMeetings.filter((m) => !m.score_data && m.transcript_text);
  if (unscored.length > 0) {
    notifications.push({
      id: "unscored",
      icon: "⏳",
      text: `${unscored.length}件の面談が採点待ち`,
      subtext: "まもなく自動採点が完了します",
      color: "#1CB0F6",
      timestamp: new Date(),
    });
  }

  return notifications.slice(0, 5);
}

const DIM_LABELS: Record<string, string> = {
  needs: "ニーズ把握",
  proposal: "提案力",
  trust: "信頼構築",
  closing: "クロージング",
  intel: "情報収集",
};

function gradeEmoji(grade: string): string {
  switch (grade) {
    case "S": return "👑";
    case "A": return "🌟";
    case "B": return "✅";
    case "C": return "💡";
    default: return "📝";
  }
}

function gradeColor(grade: string): string {
  switch (grade) {
    case "S": return "#FFC800";
    case "A": return "#58CC02";
    case "B": return "#1CB0F6";
    case "C": return "#FF9600";
    default: return "#FF4B4B";
  }
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

export default function NotificationFeed() {
  const { currentUser } = useGamification();

  const { data: myData } = useQuery({
    queryKey: ["meetings", "mine", currentUser],
    queryFn: () => fetchMeetings(undefined, undefined, currentUser, false),
    enabled: !!currentUser,
    refetchInterval: 15000,
  });

  const { data: leaderData } = useQuery({
    queryKey: ["meetings", "leader"],
    queryFn: () => fetchMeetings(undefined, undefined, undefined, true),
    refetchInterval: 30000,
  });

  const notifications = useMemo(
    () => generateNotifications(myData?.transcripts || [], leaderData?.transcripts || []),
    [myData, leaderData],
  );

  if (notifications.length === 0) {
    return (
      <div className="card-duo p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-duo-red flex items-center justify-center" style={{ borderBottom: "2px solid #cd3131" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
          </div>
          <span className="text-base font-extrabold text-[#4b4b4b]">フィード</span>
        </div>
        <div className="rounded-2xl bg-[#f7f7f7] p-4 text-center">
          <p className="text-xs font-bold text-[#afafaf]">面談を登録すると、自動で採点されてここに結果が届きます</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card-duo p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-duo-red flex items-center justify-center" style={{ borderBottom: "2px solid #cd3131" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
        </div>
        <span className="text-base font-extrabold text-[#4b4b4b]">フィード</span>
        <span className="ml-auto text-[10px] font-bold text-white bg-duo-red px-1.5 py-0.5 rounded-full">{notifications.length}</span>
      </div>

      <div className="space-y-2">
        {notifications.map((n) => (
          <div
            key={n.id}
            className="flex items-start gap-2.5 rounded-xl p-2.5 hover:bg-[#f7f7f7] transition-colors cursor-pointer group"
          >
            <span className="text-lg shrink-0 mt-0.5">{n.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-extrabold text-[#4b4b4b] group-hover:text-duo-blue transition-colors">
                {n.text}
              </p>
              {n.subtext && (
                <p className="text-[10px] font-bold text-[#afafaf] mt-0.5 line-clamp-2">{n.subtext}</p>
              )}
            </div>
            <div
              className="w-2 h-2 rounded-full shrink-0 mt-1.5"
              style={{ backgroundColor: n.color }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
