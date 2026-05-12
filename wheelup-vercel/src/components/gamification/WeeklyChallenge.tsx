import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useGamification } from "../../gamification/GamificationProvider";
import { fetchMeetings, type MeetingTranscript } from "../../api/client";

const DIM_LABELS: Record<string, string> = {
  needs: "ニーズ把握",
  proposal: "提案力",
  trust: "信頼構築",
  closing: "クロージング",
  intel: "情報収集",
};

interface Challenge {
  id: string;
  icon: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  reward: string;
}

function generateChallenges(meetings: MeetingTranscript[]): Challenge[] {
  const scored = meetings.filter((m) => m.score_data?.scores);
  const challenges: Challenge[] = [];

  if (scored.length === 0) {
    challenges.push({
      id: "first-score",
      icon: "🎯",
      title: "はじめの一歩",
      description: "面談を1件記録してスコアを���認しよう",
      progress: 0,
      target: 1,
      reward: "スコアリング解放",
    });
    return challenges;
  }

  // Find weakest dimension
  const latest = scored[0].score_data!;
  const weakest = Object.entries(latest.scores)
    .sort((a, b) => a[1] - b[1])[0];
  const weakDim = weakest[0];
  const weakVal = weakest[1];

  challenges.push({
    id: `improve-${weakDim}`,
    icon: "📈",
    title: `${DIM_LABELS[weakDim]}を${weakVal + 2}点以上にする`,
    description: `前回${weakVal}点 → ${weakVal + 2}点を目指そう`,
    progress: weakVal,
    target: weakVal + 2,
    reward: "弱点克服バッジ",
  });

  // Consecutive meetings challenge
  const thisWeek = scored.filter((m) => {
    const d = new Date(m.recorded_at);
    const now = new Date();
    const diff = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
    return diff <= 7;
  });

  challenges.push({
    id: "weekly-count",
    icon: "🔥",
    title: "今週3面談をスコアリング",
    description: "継続は力なり。週3件で成長スピード2倍",
    progress: thisWeek.length,
    target: 3,
    reward: "ストリークボーナス",
  });

  // Grade up challenge
  const grade = latest.grade;
  if (grade !== "S" && grade !== "A") {
    const nextGrade = grade === "B" ? "A" : grade === "C" ? "B" : "C";
    const threshold = nextGrade === "A" ? 35 : nextGrade === "B" ? 28 : 20;
    challenges.push({
      id: "grade-up",
      icon: "⭐",
      title: `${nextGrade}ランクに昇格する`,
      description: `あと${Math.max(0, threshold - latest.total)}点でランクアップ`,
      progress: latest.total,
      target: threshold,
      reward: "ランクアップ演出",
    });
  }

  // Beat leader on one dim
  challenges.push({
    id: "beat-leader",
    icon: "🏆",
    title: "リーダーを1軸で超える",
    description: "得意な軸を伸ばしてリーダー超えを狙おう",
    progress: 0,
    target: 1,
    reward: "リーダー超えバッジ",
  });

  return challenges.slice(0, 3);
}

export default function WeeklyChallenge() {
  const { currentUser } = useGamification();

  const { data } = useQuery({
    queryKey: ["meetings", "mine", currentUser],
    queryFn: () => fetchMeetings(undefined, undefined, currentUser, false),
    enabled: !!currentUser,
  });

  const challenges = useMemo(
    () => generateChallenges(data?.transcripts || []),
    [data],
  );

  return (
    <div className="card-duo p-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-duo-orange flex items-center justify-center" style={{ borderBottom: "2px solid #d97f00" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z"/></svg>
        </div>
        <span className="text-base font-extrabold text-[#4b4b4b]">今週のチャレンジ</span>
      </div>

      <div className="space-y-3">
        {challenges.map((c) => {
          const pct = Math.min(100, (c.progress / c.target) * 100);
          const done = c.progress >= c.target;
          return (
            <div
              key={c.id}
              className={`rounded-xl border-2 p-3 transition-colors ${
                done ? "border-duo-green/30 bg-duo-green/5" : "border-[#e5e5e5]"
              }`}
            >
              <div className="flex items-start gap-2.5">
                <span className="text-lg">{c.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-extrabold ${done ? "text-duo-green" : "text-[#4b4b4b]"}`}>
                      {c.title}
                    </span>
                    {done && <span className="text-[9px] font-black text-white bg-duo-green px-1.5 py-0.5 rounded-full">達成!</span>}
                  </div>
                  <p className="text-[10px] font-bold text-[#afafaf] mt-0.5">{c.description}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-2 bg-[#e5e5e5] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: done ? "#58CC02" : "#1CB0F6",
                        }}
                      />
                    </div>
                    <span className="text-[9px] font-black text-[#afafaf]">{c.progress}/{c.target}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
