"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PopcornLogo } from "@/components/PopcornLogo";

const navLinkClass =
  "rounded-md px-1 py-1 text-sm text-white/75 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35";
const ctaClass =
  "inline-flex items-center justify-center rounded-xl border border-[rgb(var(--red))]/30 bg-[rgb(var(--red))] px-4 py-2 text-sm font-semibold text-white transition duration-200 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_8px_20px_rgba(229,9,20,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--yellow))]/40";

export function LandingHeader() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const next = window.scrollY > 8;
      setIsScrolled((prev) => (prev === next ? prev : next));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={[
        "sticky top-0 z-50 border-b backdrop-blur-xl transition",
        isScrolled
          ? "border-white/15 bg-[rgb(var(--bg))]/85 shadow-[0_10px_26px_rgba(0,0,0,0.3)]"
          : "border-white/5 bg-[rgb(var(--bg))]/55",
      ].join(" ")}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/35">
          <PopcornLogo className="h-8 w-8" />
          <div className="leading-tight">
            <div className="text-base font-semibold tracking-tight">
              <span className="text-white">Choose</span>
              <span className="text-[rgb(var(--red))]">A</span>
              <span className="text-white">Movie</span>
            </div>
          </div>
        </Link>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-2 sm:flex-nowrap sm:gap-4">
          <nav aria-label="Primary navigation" className="order-2 w-full sm:order-1 sm:w-auto">
            <ul className="flex items-center justify-end gap-4">
              <li>
                <a href="#how-it-works" className={navLinkClass}>
                  How it works
                </a>
              </li>
              <li>
                <Link href="/about" className={navLinkClass}>
                  About
                </Link>
              </li>
              <li>
                <Link href="/signin" className={navLinkClass}>
                  Sign in
                </Link>
              </li>
            </ul>
          </nav>

          <Link href="/create" className={["order-1 sm:order-2", ctaClass].join(" ")}>
            Create a group
          </Link>
        </div>
      </div>
    </header>
  );
}
