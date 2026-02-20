"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PopcornLogo } from "@/components/PopcornLogo";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const links = [
    { href: "/groups", label: "My groups" },
    { href: "/create", label: "Create" },
    { href: "/signin", label: "Sign in" },
  ];

  return (
    <div className="min-h-screen text-[rgb(var(--text))]">
      <header className="sticky top-0 z-50 border-b border-white/12 bg-[rgb(var(--bg))]/72 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--yellow))]/35"
          >
            <PopcornLogo className="h-8 w-8" />
            <div className="leading-tight">
              <div className="text-base font-semibold tracking-tight">
                <span className="text-[rgb(var(--text))]">Choose</span>
                <span className="text-[rgb(var(--red))]">A</span>
                <span className="text-[rgb(var(--text))]">Movie</span>
              </div>
              <div className="text-xs text-white/58">Group picks, fast.</div>
            </div>
          </Link>

          <nav aria-label="Primary" className="ml-auto">
            <ul className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
              {links.map((link) => {
                const active = pathname === link.href;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className={[
                        "inline-flex items-center rounded-lg border px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--yellow))]/35",
                        active
                          ? "border-white/22 bg-white/12 text-white"
                          : "border-transparent text-white/78 hover:border-white/14 hover:bg-white/[0.05] hover:text-white",
                      ].join(" ")}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </header>

      <main className="cam-page-enter mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
