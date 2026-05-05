const MEMBERS = [
  { name: "小林", role: "リーダー", color: "#FF9600", icon: "👑" },
  { name: "西村", role: "メンバー", color: "#1CB0F6", icon: "💼" },
  { name: "辻内", role: "メンバー", color: "#58CC02", icon: "💼" },
  { name: "安藤", role: "メンバー", color: "#CE82FF", icon: "💼" },
  { name: "村上", role: "メンバー", color: "#FF4B4B", icon: "💼" },
];

export default function UserSelectPage({ onSelect }: { onSelect: (name: string) => void }) {
  return (
    <div className="min-h-screen bg-[#f7f7f7] flex items-center justify-center px-4">
      <div className="card-duo p-8 max-w-sm w-full text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-duo-green flex items-center justify-center" style={{ borderBottom: "4px solid #46a302" }}>
          <span className="text-white text-2xl font-black">W</span>
        </div>
        <h1 className="text-xl font-black text-[#4b4b4b] mb-1">wheelsUp</h1>
        <p className="text-sm font-bold text-[#afafaf] mb-6">ユーザーを選択してください</p>

        <div className="space-y-2">
          {MEMBERS.map((m) => (
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
                <span className="text-[10px] font-bold text-[#afafaf] ml-2">{m.role}</span>
              </div>
              {m.role === "リーダー" && (
                <span className="text-[9px] font-black text-white bg-duo-orange px-2 py-0.5 rounded-full">LEADER</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
