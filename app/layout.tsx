import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Belto Flashcards",
  description: "Lightweight SRS flashcards",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        <header className="border-b bg-white">
          <div className="mx-auto max-w-4xl px-6 py-4 flex items-center justify-between">
            <Link href="/" className="font-semibold tracking-tight">Belto Flashcards</Link>
            <nav className="text-sm text-neutral-600">
              <Link className="hover:underline" href="/">Decks</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-4xl px-6 py-8">{children}</main>
        <footer className="border-t mt-12">
          <div className="mx-auto max-w-4xl px-6 py-6 text-xs text-neutral-500">
            Built with ❤️ on a 3090
          </div>
        </footer>
      </body>
    </html>
  );
}
