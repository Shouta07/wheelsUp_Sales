import { useState } from "react";
import { AXIS_CURRICULUM, CATEGORY_STYLE, type AxisKey } from "../../lib/axisLearning";

/**
 * 学習モーダル（アプリ内教材）。西村 FB「外部URLでなく、テーマごとにカテゴリ化して強化する仕組み」。
 * 5 軸をタブで切替え、各軸のカリキュラム（面談技術 / 業界知識 / 顧客知識）を表示する。
 */
const ORDER: AxisKey[] = ["needs", "proposal", "trust", "closing", "intel"];

export default function LearningModal({
  axis,
  onClose,
}: {
  axis: AxisKey;
  onClose: () => void;
}) {
  const [active, setActive] = useState<AxisKey>(axis);
  const cur = AXIS_CURRICULUM[active];

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-3"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[88vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#eee]">
          <span className="text-sm font-black text-[#4b4b4b]">📚 学習ライブラリ（小林の流派を強化）</span>
          <button onClick={onClose} className="w-7 h-7 rounded-full hover:bg-gray-100 text-[#777] font-black">✕</button>
        </div>

        {/* 軸タブ */}
        <div className="flex gap-1 px-3 py-2 border-b border-[#eee] overflow-x-auto">
          {ORDER.map((k) => {
            const c = AXIS_CURRICULUM[k];
            const on = k === active;
            return (
              <button
                key={k}
                onClick={() => setActive(k)}
                className="shrink-0 text-[11px] font-extrabold px-2.5 py-1.5 rounded-xl transition-colors"
                style={on ? { backgroundColor: c.color + "20", color: c.color } : { color: "#afafaf" }}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {/* 本文 */}
        <div className="overflow-y-auto p-4 space-y-3">
          <div className="rounded-xl px-3 py-2" style={{ backgroundColor: cur.color + "12" }}>
            <p className="text-[10px] font-extrabold" style={{ color: cur.color }}>この軸のゴール</p>
            <p className="text-[12px] font-bold text-[#4b4b4b] leading-relaxed mt-0.5">{cur.goal}</p>
          </div>

          {cur.sections.map((sec, i) => {
            const cs = CATEGORY_STYLE[sec.category];
            return (
              <div key={i} className="rounded-xl border border-[#eee] overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-[#fafafa]">
                  <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded" style={{ backgroundColor: cs.bg, color: cs.fg }}>
                    {sec.category}
                  </span>
                  <span className="text-[12px] font-extrabold text-[#4b4b4b]">{sec.title}</span>
                </div>
                <ul className="p-3 space-y-1.5">
                  {sec.points.map((p, j) => (
                    <li key={j} className="flex items-start gap-1.5 text-[11px] font-bold text-[#4b4b4b] leading-relaxed">
                      <span className="shrink-0 mt-[2px]" style={{ color: cur.color }}>●</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}

          <p className="text-[9px] text-[#aaa] leading-relaxed">
            ※ この教材は採点ルーブリック（小林の流派）と連動しています。各面談の弱い軸からここに来て、型と知識を仕込んでから次の面談に臨みましょう。
          </p>
        </div>
      </div>
    </div>
  );
}
