"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type UserMenuProps = {
  label: string;
  onSignOut: () => Promise<void> | void;
  isSigningOut?: boolean;
  accountHref?: string;
  triggerClassName?: string;
};

export function UserMenu({
  label,
  onSignOut,
  isSigningOut = false,
  accountHref = "/account",
  triggerClassName,
}: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={
          triggerClassName ??
          "inline-flex items-center justify-center rounded-lg border border-transparent px-3 py-1.5 text-sm leading-none text-white/78 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--yellow))]/35 hover:border-white/14 hover:bg-white/[0.05] hover:text-white"
        }
      >
        {label}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 min-w-[180px] rounded-xl border border-white/14 bg-[rgb(var(--card-2))]/95 p-1.5 shadow-[0_18px_36px_rgba(0,0,0,0.35)] backdrop-blur"
        >
          <Link
            href={accountHref}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-lg px-3 py-2 text-sm text-white/85 transition hover:bg-white/10 hover:text-white"
          >
            Account
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={async () => {
              await onSignOut();
              setOpen(false);
            }}
            disabled={isSigningOut}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-white/85 transition hover:bg-white/10 hover:text-white disabled:opacity-60"
          >
            {isSigningOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
