import { useState } from "react";

const KNOWN_USERS_KEY = "wheelsup_known_users";

function getKnownUsers(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KNOWN_USERS_KEY) || "[]");
  } catch {
    return [];
  }
}

function addKnownUser(name: string) {
  const users = getKnownUsers();
  if (!users.includes(name)) {
    localStorage.setItem(KNOWN_USERS_KEY, JSON.stringify([...users, name]));
  }
}

export default function UserSelectPage({ onSelect }: { onSelect: (name: string) => void }) {
  const [name, setName] = useState("");
  const knownUsers = getKnownUsers();

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    addKnownUser(trimmed);
    onSelect(trimmed);
  };

  return (
    <div className="min-h-screen bg-[#f7f7f7] flex items-center justify-center px-4">
      <div className="card-duo p-8 max-w-sm w-full text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-duo-green flex items-center justify-center" style={{ borderBottom: "4px solid #46a302" }}>
          <span className="text-white text-2xl font-black">W</span>
        </div>
        <h1 className="text-xl font-black text-[#4b4b4b] mb-1">wheelsUp</h1>
        <p className="text-sm font-bold text-[#afafaf] mb-6">あなたの名前を入力してください</p>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          placeholder="例: 田中太郎"
          className="w-full rounded-2xl border-2 border-[#e5e5e5] px-4 py-3 text-sm font-bold text-[#4b4b4b] focus:border-duo-green focus:outline-none mb-4"
          autoFocus
        />

        <button
          onClick={handleSubmit}
          disabled={!name.trim()}
          className="btn-duo btn-duo-green w-full !text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          はじめる
        </button>

        {knownUsers.length > 0 && (
          <div className="mt-6">
            <p className="text-xs font-bold text-[#afafaf] mb-3">または既存ユーザーを選択</p>
            <div className="space-y-2">
              {knownUsers.map((user) => (
                <button
                  key={user}
                  onClick={() => onSelect(user)}
                  className="w-full flex items-center gap-3 rounded-2xl border-2 border-[#e5e5e5] px-4 py-3 text-left hover:bg-[#f7f7f7] hover:border-duo-green transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-duo-blue flex items-center justify-center shrink-0" style={{ borderBottom: "2px solid #1899d6" }}>
                    <span className="text-white text-xs font-black">{user[0]}</span>
                  </div>
                  <span className="text-sm font-bold text-[#4b4b4b]">{user}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
