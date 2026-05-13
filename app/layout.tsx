import "./globals.css";
import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Wheels Up Sales — RA prospecting",
  description: "社内ツール（公開禁止）",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

const nav = [
  { href: "/", label: "概況" },
  { href: "/ready", label: "実行待ち" },
  { href: "/companies", label: "企業" },
  { href: "/discovery", label: "発掘キュー" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-6">
            <Link href="/" className="font-semibold text-brand-600">Wheels Up Sales</Link>
            <nav className="flex gap-4 text-sm text-gray-600">
              {nav.map((n) => (
                <Link key={n.href} href={n.href} className="hover:text-brand-600">{n.label}</Link>
              ))}
            </nav>
            <span className="ml-auto text-xs text-gray-400">社内ツール / noindex</span>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
