import { useCallback, useEffect, useState } from "react";
import { useGamification } from "../../gamification/GamificationProvider";

interface Particle { id: number; x: number; color: string; delay: number; size: number; }

const COLORS = ["#58CC02", "#FFC800", "#1CB0F6", "#FF4B4B", "#CE82FF", "#FF9600"];

export default function CelebrationOverlay() {
  const { popCelebration } = useGamification();
  const [message, setMessage] = useState<{ title: string; sub: string } | null>(null);
  const [particles, setParticles] = useState<Particle[]>([]);

  const burst = useCallback(() => {
    const ps: Particle[] = [];
    for (let i = 0; i < 50; i++) {
      ps.push({
        id: i,
        x: Math.random() * 100,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        delay: Math.random() * 600,
        size: 5 + Math.random() * 7,
      });
    }
    setParticles(ps);
    setTimeout(() => setParticles([]), 3000);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const c = popCelebration();
      if (!c) return;
      burst();
      if (c.startsWith("level_up_")) {
        setMessage({ title: `Level ${c.split("_")[2]}`, sub: "レベルアップ！" });
      } else if (c.startsWith("quest_")) {
        setMessage({ title: "クエスト達成", sub: "XP ボーナス獲得！" });
      } else if (c === "achievement_score_40") {
        setMessage({ title: "👑 Sランク到達！", sub: "面談スコア40点以上を達成" });
      } else if (c === "achievement_score_35") {
        setMessage({ title: "🌟 Aランク到達！", sub: "面談スコア35点以上を達成" });
      } else if (c === "achievement_beat_leader_1") {
        setMessage({ title: "💪 リーダー超え！", sub: "1軸でリーダー平均を上回った" });
      } else if (c.startsWith("achievement_")) {
        setMessage({ title: "🎯 バッジ解放！", sub: "新しいアチーブメントを獲得" });
      }
      setTimeout(() => setMessage(null), 2800);
    }, 500);
    return () => clearInterval(interval);
  }, [popCelebration, burst]);

  if (!message && particles.length === 0) return null;

  return (
    <>
      {/* Confetti */}
      <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute animate-confetti"
            style={{
              left: `${p.x}%`,
              top: "-10px",
              animationDelay: `${p.delay}ms`,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              borderRadius: Math.random() > 0.5 ? "50%" : "2px",
            }}
          />
        ))}
      </div>

      {/* Message */}
      {message && (
        <div className="fixed inset-0 flex items-center justify-center z-[9998] pointer-events-none">
          <div className="animate-celebration-pop card-duo p-8 text-center max-w-xs mx-4 border-duo-green border-4">
            <div className="text-3xl font-black text-[#4b4b4b] mb-1">{message.title}</div>
            <div className="text-sm font-bold text-[#afafaf]">{message.sub}</div>
          </div>
        </div>
      )}
    </>
  );
}
