import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

import { isLive } from "@/lib/supabase";

export const metadata: Metadata = {
  title: "Wheels Up Prospecting",
  description: "RA prospecting console (internal)",
  robots: { index: false, follow: false, nocache: true },
};

const NAV = [
  { href: "/", label: "ダッシュボード" },
  { href: "/ready", label: "実行待ち" },
  { href: "/companies", label: "企業一覧" },
  { href: "/discovery", label: "新規発掘" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <header className="border-b border-line bg-white">
          <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-3">
            <Link href="/" className="font-semibold text-ink">
              Wheels Up Prospecting
            </Link>
            <nav className="flex gap-4 text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="text-mute hover:text-ink">
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="ml-auto text-xs">
              <span className={`chip ${isLive ? "chip-grade-good" : "chip-grade-bad"}`}>
                {isLive ? "LIVE (Supabase)" : "MOCK (CSV/JSON)"}
              </span>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
