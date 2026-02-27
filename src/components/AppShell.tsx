"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { GroupTabs } from "@/components/GroupTabs";
import { UserMenu } from "@/components/UserMenu";
import {
  getAuthSnapshot,
  signOutCurrentUser,
  subscribeAuthSnapshot,
  type AuthSnapshot,
} from "@/lib/authClient";
import { isSupabaseConfigured } from "@/lib/supabase";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [auth, setAuth] = useState<AuthSnapshot>({
    userId: null,
    email: null,
    provider: null,
    hasSession: false,
    isAnonymous: false,
  });
  const [isSigningOut, setIsSigningOut] = useState(false);
  const hasAuth = isSupabaseConfigured();

  useEffect(() => {
    let alive = true;
    void getAuthSnapshot().then((snapshot) => {
      if (!alive) return;
      setAuth(snapshot);
    });

    const unsubscribe = subscribeAuthSnapshot((snapshot) => {
      setAuth(snapshot);
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const accountLabel = useMemo(() => {
    if (!auth.hasSession) return "Sign in";
    if (auth.isAnonymous) return "Guest";
    if (auth.firstName) return auth.firstName;
    if (auth.email) return "Account";
    return "Signed in";
  }, [auth.email, auth.firstName, auth.hasSession, auth.isAnonymous]);

  const links = [
    ...(auth.hasSession && !auth.isAnonymous ? [{ href: "/groups", label: "My groups" }] : []),
    { href: "/create", label: "Create" },
    ...(!auth.hasSession || auth.isAnonymous ? [{ href: "/signin", label: "Sign in" }] : []),
  ];
  const groupTabsGroupId = useMemo(() => {
    const match = pathname.match(/^\/g\/([^/]+)(?:\/(rate|results))?$/);
    if (!match) return null;
    return match[1];
  }, [pathname]);

  async function onSignOut() {
    if (isSigningOut || !hasAuth || !auth.hasSession) return;
    setIsSigningOut(true);
    try {
      await signOutCurrentUser();
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className="min-h-screen text-[rgb(var(--text))]">
      <header className="sticky top-0 z-50 border-b border-white/12 bg-[rgb(var(--bg))]/72 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-6xl px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/"
              className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--yellow))]/35"
            >
              <Image
                src="/brand/logo-lockup.svg"
                alt="ChooseAMovie"
                width={262}
                height={56}
                priority
                className="h-9 w-auto sm:h-10"
              />
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
                {auth.hasSession && !auth.isAnonymous ? (
                  <li>
                    <UserMenu label={accountLabel} onSignOut={onSignOut} isSigningOut={isSigningOut} />
                  </li>
                ) : null}
              </ul>
            </nav>
          </div>

          {groupTabsGroupId ? (
            <div className="mt-3">
              <GroupTabs groupId={groupTabsGroupId} variant="header" />
            </div>
          ) : null}
        </div>
      </header>

      <main className="cam-page-enter mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
