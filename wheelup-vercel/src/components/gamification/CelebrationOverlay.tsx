import { useCallback, useEffect, useState } from "react";
import { useGamification } from "../../gamification/GamificationProvider";

interface Particle {
  id: number;
  x: number;
  color: string;
  delay: number;
  size: number;
}

function Confetti({ particles }: { particles: Particle[] }) {
  return (
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
  );
}

export default function CelebrationOverlay() {
  const { popCelebration } = useGamification();
  const [celebration, setCelebration] = useState<string | null>(null);
  const [particles, setParticles] = useState<Particle[]>([]);

  const COLORS = ["#58CC02", "#FFC800", "#1CB0F6", "#FF4B4B", "#CE82FF", "#FF9600"];

  const triggerConfetti = useCallback(() => {
    const ps: Particle[] = [];
    for (let i = 0; i < 60; i++) {
      ps.push({
        id: i,
        x: Math.random() * 100,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        delay: Math.random() * 800,
        size: 6 + Math.random() * 8,
      });
    }
    setParticles(ps);
    setTimeout(() => setParticles([]), 3000);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const c = popCelebration();
      if (c) {
        setCelebration(c);
        triggerConfetti();
        setTimeout(() => setCelebration(null), 3000);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [popCelebration, triggerConfetti]);

  if (!celebration && particles.length === 0) return null;

  const getMessage = () => {
    if (!celebration) return null;
    if (celebration.startsWith("level_up_")) {
      const level = celebration.split("_")[2];
      return { title: "レベルアップ！", sub: `Level ${level} に到達！`, icon: "⬆️" };
    }
    if (celebration.startsWith("quest_")) {
      return { title: "クエスト達成！", sub: "ボーナス XP 獲得！", icon: "✅" };
    }
    if (celebration.startsWith("achievement_")) {
      return { title: "アチーブメント解除！", sub: "新しいバッジを獲得！", icon: "🏅" };
    }
    return null;
  };

  const msg = getMessage();

  return (
    <>
      <Confetti particles={particles} />
      {msg && (
        <div className="fixed inset-0 flex items-center justify-center z-[9998] pointer-events-none">
          <div className="animate-celebration-pop bg-white rounded-3xl shadow-2xl border-4 border-duo-green p-8 text-center max-w-sm mx-4">
            <span className="text-5xl block mb-3">{msg.icon}</span>
            <h2 className="text-2xl font-black text-gray-900 mb-1">{msg.title}</h2>
            <p className="text-sm text-gray-500 font-medium">{msg.sub}</p>
          </div>
        </div>
      )}
    </>
  );
}
