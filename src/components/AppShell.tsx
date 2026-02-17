"use client";

import Link from "next/link";
import { PopcornLogo } from "@/components/PopcornLogo";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[rgb(var(--bg))] text-[rgb(var(--text))]">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[rgb(var(--bg))]/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <PopcornLogo className="h-8 w-8" />
            <div className="leading-tight">
              <div className="text-base font-semibold tracking-tight">
                <span className="text-[rgb(var(--text))]">Choose</span>
                <span className="text-[rgb(var(--red))]">A</span>
                <span className="text-[rgb(var(--text))]">Movie</span>
              </div>
              <div className="text-xs text-white/60">Group picks, fast.</div>
            </div>
          </Link>

          <Link
            href="/create"
            className="rounded-full bg-[rgb(var(--red))] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110 active:brightness-95"
          >
            New group
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>

      <footer className="mx-auto max-w-3xl px-4 pb-8 pt-2 text-xs text-white/45">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          Tip: Right now groups save to this browser only. Later we will add a shared database so invite links work across devices.
        </div>
      </footer>
    </div>
  );
}
