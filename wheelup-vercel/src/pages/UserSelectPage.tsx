import { TEAM_MEMBERS } from "../lib/team";

export default function UserSelectPage({
  onSelect,
  onSkipForRA,
}: {
  onSelect: (name: string) => void;
  onSkipForRA?: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#f7f7f7] flex items-center justify-center px-4 py-8">
      <div className="card-duo p-8 max-w-sm w-full text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-duo-green flex items-center justify-center" style={{ borderBottom: "4px solid #46a302" }}>
          <span className="text-white text-2xl font-black">W</span>
        </div>
        <h1 className="text-xl font-black text-[#4b4b4b] mb-1">wheelsUp</h1>
        <p className="text-sm font-bold text-[#afafaf] mb-2">面談FB を使うユーザーを選択</p>
        <p className="text-[10px] font-bold text-[#afafaf] mb-6">(スコア追跡用 — RA 開拓だけなら下のボタンへ)</p>

        <div className="space-y-2">
          {TEAM_MEMBERS.map((m) => {
            const roleLabel = m.role === "leader" ? "リーダー" : "メンバー";
            return (
              <button
                key={m.name}
                onClick={() => onSelect(m.name)}
                className="w-full flex items-center gap-3 rounded-2xl border-2 border-[#e5e5e5] px-4 py-3 text-left hover:bg-[#f7f7f7] hover:border-duo-green transition-colors"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-lg"
                  style={{ backgroundColor: m.color + "20", borderBottom: `2px solid ${m.color}` }}
                >
                  {m.icon}
                </div>
                <div className="flex-1">
                  <span className="text-sm font-bold text-[#4b4b4b]">{m.name}</span>
                  <span className="text-[10px] font-bold text-[#afafaf] ml-2">{roleLabel}</span>
                </div>
                {m.role === "leader" && (
                  <span className="text-[9px] font-black text-white bg-duo-orange px-2 py-0.5 rounded-full">LEADER</span>
                )}
              </button>
            );
          })}
        </div>

        {onSkipForRA && (
          <>
            <div className="my-6 flex items-center gap-2">
              <div className="flex-1 h-px bg-[#e5e5e5]" />
              <span className="text-[10px] font-bold text-[#afafaf]">または</span>
              <div className="flex-1 h-px bg-[#e5e5e5]" />
            </div>
            <button
              onClick={onSkipForRA}
              className="w-full rounded-2xl bg-duo-blue text-white px-4 py-3 text-sm font-black hover:bg-[#1899D6] transition-colors"
              style={{ borderBottom: "4px solid #1899D6" }}
            >
              🎯 RA 開拓を見る (ログイン不要)
            </button>
            <p className="text-[10px] font-bold text-[#afafaf] mt-2">
              246 社 × 4 候補者のマッチング — チーム共有データ
            </p>
          </>
        )}
      </div>
    </div>
  );
}
