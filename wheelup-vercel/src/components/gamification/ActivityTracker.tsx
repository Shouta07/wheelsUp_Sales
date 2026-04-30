import { useGamification } from "../../gamification/GamificationProvider";

const DAILY_TARGETS = {
  calls: 10,
  meetings: 3,
  emails: 5,
  tasks: 5,
};

const ACTIVITY_TYPES = [
  { key: "calls" as const, label: "架電", icon: "📞", color: "#58CC02", dark: "#46a302", xpPer: 15 },
  { key: "meetings" as const, label: "面談", icon: "🤝", color: "#1CB0F6", dark: "#1899d6", xpPer: 30 },
  { key: "emails" as const, label: "メール", icon: "📧", color: "#CE82FF", dark: "#a85fd6", xpPer: 5 },
  { key: "tasks" as const, label: "タスク", icon: "✅", color: "#FF9600", dark: "#d97f00", xpPer: 10 },
] as const;

export default function ActivityTracker() {
  const { myMetrics, loading } = useGamification();

  const todayCalls = myMetrics?.today_calls ?? 0;
  const todayMeetings = myMetrics?.today_meetings ?? 0;
  const todayEmails = myMetrics?.today_emails ?? 0;
  const todayTasks = myMetrics?.today_tasks ?? 0;
  const todayXp = myMetrics?.today_xp ?? 0;
  const todayTotal = myMetrics?.today_total ?? 0;

  const todayData = {
    calls: todayCalls,
    meetings: todayMeetings,
    emails: todayEmails,
    tasks: todayTasks,
  };

  const totalTarget = Object.values(DAILY_TARGETS).reduce((a, b) => a + b, 0);
  const overallPct = Math.min((todayTotal / totalTarget) * 100, 100);
  const allDone = todayTotal >= totalTarget;

  return (
    <div className="card-duo p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-duo-green flex items-center justify-center" style={{ borderBottom: "2px solid #46a302" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
          </div>
          <span className="text-base font-extrabold text-[#4b4b4b]">今日の活動</span>
        </div>
        <div className="flex items-center gap-2">
          {todayXp > 0 && (
            <span className="text-sm font-black text-duo-green">+{todayXp} XP</span>
          )}
          {loading && (
            <div className="w-4 h-4 border-2 border-duo-green border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      </div>

      {/* Overall progress ring */}
      <div className="flex items-center gap-4 mb-5">
        <div className="relative w-16 h-16 shrink-0">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e5e5e5" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="15.5" fill="none"
              stroke={allDone ? "#58CC02" : "#1CB0F6"}
              strokeWidth="3" strokeLinecap="round"
              strokeDasharray={`${15.5 * 2 * Math.PI}`}
              strokeDashoffset={`${15.5 * 2 * Math.PI * (1 - overallPct / 100)}`}
              style={{ transition: "stroke-dashoffset 1s ease-out" }}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-black text-[#4b4b4b]">{todayTotal}</span>
          </div>
        </div>
        <div className="flex-1">
          <div className="text-sm font-extrabold text-[#4b4b4b]">
            {allDone ? "目標達成！" : `あと${totalTarget - todayTotal}件で目標達成`}
          </div>
          <div className="text-xs font-bold text-[#afafaf]">
            目標: {totalTarget}件/日（架電{DAILY_TARGETS.calls} + 面談{DAILY_TARGETS.meetings} + メール{DAILY_TARGETS.emails} + タスク{DAILY_TARGETS.tasks}）
          </div>
          {allDone && (
            <div className="mt-1 text-xs font-extrabold text-duo-green animate-streak-pulse">
              すごい！全目標クリア！
            </div>
          )}
        </div>
      </div>

      {/* Activity bars */}
      <div className="space-y-3">
        {ACTIVITY_TYPES.map(({ key, label, icon, color, dark, xpPer }) => {
          const current = todayData[key];
          const target = DAILY_TARGETS[key];
          const pct = Math.min((current / target) * 100, 100);
          const done = current >= target;

          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{icon}</span>
                  <span className="text-xs font-extrabold text-[#4b4b4b]">{label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold" style={{ color: done ? color : "#afafaf" }}>
                    {current}/{target}
                  </span>
                  {current > 0 && (
                    <span className="text-[10px] font-black" style={{ color }}>
                      +{current * xpPer}XP
                    </span>
                  )}
                </div>
              </div>
              <div className="h-3 bg-[#e5e5e5] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 relative"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: color,
                    boxShadow: done ? `0 0 8px ${color}40` : "none",
                  }}
                >
                  {done && (
                    <div
                      className="absolute right-0.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
                      style={{ backgroundColor: dark }}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Milestone hints */}
      {todayTotal > 0 && !allDone && (
        <div className="mt-4 rounded-xl bg-[#f7f7f7] px-3 py-2">
          {todayCalls < DAILY_TARGETS.calls && (
            <p className="text-[10px] font-bold text-[#afafaf]">
              💡 あと{DAILY_TARGETS.calls - todayCalls}件架電すると+{(DAILY_TARGETS.calls - todayCalls) * 15}XP
            </p>
          )}
          {todayMeetings < DAILY_TARGETS.meetings && todayCalls >= DAILY_TARGETS.calls && (
            <p className="text-[10px] font-bold text-[#afafaf]">
              💡 面談あと{DAILY_TARGETS.meetings - todayMeetings}件で+{(DAILY_TARGETS.meetings - todayMeetings) * 30}XP
            </p>
          )}
        </div>
      )}

      {todayTotal === 0 && !loading && (
        <div className="mt-4 rounded-xl bg-[#f7f7f7] p-4 text-center">
          <p className="text-sm font-bold text-[#777]">Pipedriveに活動を記録してXPを稼ごう</p>
          <p className="text-[10px] text-[#afafaf] mt-1">架電=15XP / 面談=30XP / メール=5XP / タスク=10XP</p>
        </div>
      )}
    </div>
  );
}
