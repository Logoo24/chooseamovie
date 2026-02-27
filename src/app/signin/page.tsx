"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button, Card, CardTitle, Input, Muted, Pill } from "@/components/ui";
import { deleteGroup, getMyGroups, leaveGroup } from "@/lib/groupStore";
import {
  bootstrapSignedInProfile,
  getAuthSnapshot,
  signInWithEmailPassword,
  signInWithGoogle,
  signUpWithEmailPassword,
  subscribeAuthSnapshot,
  type AuthSnapshot,
} from "@/lib/authClient";
import { isSupabaseConfigured } from "@/lib/supabase";

type GroupCard = {
  id: string;
  name: string;
  createdAt: string;
  isHost: boolean;
};

type ConfirmState =
  | {
      groupId: string;
      groupName: string;
      action: "delete" | "leave";
    }
  | null;

const INITIAL_AUTH: AuthSnapshot = {
  userId: null,
  email: null,
  provider: null,
  hasSession: false,
  isAnonymous: false,
};

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [groups, setGroups] = useState<GroupCard[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [isActing, setIsActing] = useState(false);

  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">("info");

  const [auth, setAuth] = useState<AuthSnapshot>(INITIAL_AUTH);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmittingEmailAuth, setIsSubmittingEmailAuth] = useState(false);
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authTone, setAuthTone] = useState<"info" | "success" | "error">("info");

  const hasSupabaseAuth = isSupabaseConfigured();
  const canViewGroups = auth.hasSession && !auth.isAnonymous;
  const bootstrappedUserIdRef = useRef<string | null>(null);
  const handledPostSignInRedirectRef = useRef(false);
  const nextPathRaw = searchParams.get("next")?.trim() ?? "";
  const nextPath = nextPathRaw.startsWith("/") ? nextPathRaw : "";

  const applyAuthMessage = useCallback((text: string, tone: "info" | "success" | "error") => {
    setAuthMessage(text);
    setAuthTone(tone);
  }, []);

  const maybeBootstrapProfile = useCallback(async (snapshot: AuthSnapshot) => {
    if (!snapshot.hasSession || snapshot.isAnonymous || !snapshot.userId) return;
    if (bootstrappedUserIdRef.current === snapshot.userId) return;

    const result = await bootstrapSignedInProfile();
    if (result.ok) {
      bootstrappedUserIdRef.current = snapshot.userId;
      return;
    }

    applyAuthMessage(`Signed in, but profile bootstrap failed: ${result.error ?? "Unknown error."}`, "error");
  }, [applyAuthMessage]);

  const loadGroups = useCallback(async () => {
    setIsLoadingGroups(true);
    setMessage("");
    setMessageTone("info");

    const remote = await getMyGroups();
    const byId = new Map<string, GroupCard>();

    for (const group of remote.hosted) {
      byId.set(group.id, {
        id: group.id,
        name: group.name,
        createdAt: group.createdAt,
        isHost: true,
      });
    }

    for (const group of remote.joined) {
      if (byId.has(group.id)) continue;
      byId.set(group.id, {
        id: group.id,
        name: group.name,
        createdAt: group.createdAt,
        isHost: false,
      });
    }

    setGroups(Array.from(byId.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));

    if (remote.error === "network") {
      setMessage("Some groups may be missing while offline.");
      setMessageTone("info");
    } else if (remote.error === "forbidden") {
      setMessage("Some groups are hidden due to access rules.");
      setMessageTone("info");
    } else if (remote.error === "auth_failed") {
      setMessage("Could not load your groups right now.");
      setMessageTone("info");
    }

    setIsLoadingGroups(false);
  }, []);

  useEffect(() => {
    let alive = true;

    void getAuthSnapshot().then(async (snapshot) => {
      if (!alive) return;
      setAuth(snapshot);
      setIsAuthReady(true);
      await maybeBootstrapProfile(snapshot);
    });

    const unsubscribe = subscribeAuthSnapshot((snapshot) => {
      setAuth(snapshot);
      setIsAuthReady(true);
      void maybeBootstrapProfile(snapshot);
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [maybeBootstrapProfile]);

  useEffect(() => {
    if (!canViewGroups) {
      setGroups([]);
      setIsLoadingGroups(false);
      setMessage("");
      return;
    }
    void loadGroups();
  }, [canViewGroups, loadGroups]);

  useEffect(() => {
    if (!isAuthReady) return;
    if (auth.hasSession && !auth.isAnonymous) {
      if (handledPostSignInRedirectRef.current) return;
      handledPostSignInRedirectRef.current = true;
      router.replace(nextPath || "/");
      return;
    }
    handledPostSignInRedirectRef.current = false;
  }, [auth.hasSession, auth.isAnonymous, isAuthReady, nextPath, router]);

  const hasGroups = useMemo(() => groups.length > 0, [groups.length]);

  async function onEmailAuthSubmit() {
    if (isSubmittingEmailAuth) return;
    setIsSubmittingEmailAuth(true);
    applyAuthMessage("", "info");

    try {
      const redirectTo = `${window.location.origin}/signin`;
      const redirectWithNext = nextPath ? `${redirectTo}?next=${encodeURIComponent(nextPath)}` : redirectTo;

      if (authMode === "signup") {
        const result = await signUpWithEmailPassword({
          email,
          password,
          fullName,
          phoneNumber,
          redirectTo: redirectWithNext,
        });
        if (!result.ok) {
          applyAuthMessage(result.error ?? "Could not create account right now.", "error");
          return;
        }
        if (result.requiresEmailConfirmation) {
          applyAuthMessage("Check your email to confirm your account, then sign in.", "success");
          return;
        }
        applyAuthMessage("Account created. Signing you in...", "success");
        return;
      }

      const result = await signInWithEmailPassword(email, password);
      if (!result.ok) {
        applyAuthMessage(result.error ?? "Could not sign in with email and password.", "error");
        return;
      }
      applyAuthMessage("Signed in. Redirecting...", "success");
    } finally {
      setIsSubmittingEmailAuth(false);
    }
  }

  async function onGoogleSignIn() {
    if (isSigningInGoogle) return;
    setIsSigningInGoogle(true);
    applyAuthMessage("", "info");

    try {
      const redirectTo = `${window.location.origin}/signin`;
      const redirectWithNext = nextPath ? `${redirectTo}?next=${encodeURIComponent(nextPath)}` : redirectTo;
      const result = await signInWithGoogle(redirectWithNext);
      if (!result.ok) {
        applyAuthMessage(result.error ?? "Could not start Google sign-in.", "error");
      }
    } finally {
      setIsSigningInGoogle(false);
    }
  }

  async function onConfirmAction() {
    if (!confirmState || isActing) return;
    setIsActing(true);

    try {
      if (confirmState.action === "delete") {
        const result = await deleteGroup(confirmState.groupId);
        if (result.error !== "none") {
          setConfirmState(null);
          setMessageTone("error");
          setMessage(
            result.error === "forbidden"
              ? "You do not have permission to delete this group."
              : "Could not delete the group right now. Please try again."
          );
          return;
        }
        setGroups((current) => current.filter((g) => g.id !== confirmState.groupId));
        setMessageTone("success");
        setMessage(`Deleted "${confirmState.groupName}".`);
      } else {
        const result = await leaveGroup(confirmState.groupId);
        if (result.error !== "none") {
          setConfirmState(null);
          setMessageTone("error");
          setMessage(
            result.error === "forbidden"
              ? "You do not have permission to leave this group."
              : "Could not leave the group right now. Please try again."
          );
          return;
        }
        setGroups((current) => current.filter((g) => g.id !== confirmState.groupId));
        setMessageTone("success");
        setMessage(`Left "${confirmState.groupName}".`);
      }

      setConfirmState(null);
    } finally {
      setIsActing(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <Card>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Account access</h1>
            </div>

            {!hasSupabaseAuth ? (
              <Muted>
                Supabase is not configured in this environment, so sign-in features are unavailable.
              </Muted>
            ) : (
              <>
                {!isAuthReady ? (
                  <Muted>Checking current session...</Muted>
                ) : auth.hasSession ? (
                  <Muted>
                    {auth.isAnonymous
                      ? "Create an account or sign in to continue."
                      : `Signed in${auth.email ? ` as ${auth.email}` : ""}. Redirecting...`}
                  </Muted>
                ) : (
                  <Muted>Sign in or create an account to continue.</Muted>
                )}

                <div className="space-y-3 rounded-xl border border-white/12 bg-black/25 p-4">
                  <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/20 p-1">
                    <button
                      type="button"
                      onClick={() => setAuthMode("signin")}
                      className={[
                        "rounded-lg px-3 py-2 text-sm font-medium transition",
                        authMode === "signin"
                          ? "bg-white/14 text-white"
                          : "text-white/70 hover:bg-white/7 hover:text-white",
                      ].join(" ")}
                    >
                      Sign in
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode("signup")}
                      className={[
                        "rounded-lg px-3 py-2 text-sm font-medium transition",
                        authMode === "signup"
                          ? "bg-white/14 text-white"
                          : "text-white/70 hover:bg-white/7 hover:text-white",
                      ].join(" ")}
                    >
                      Create account
                    </button>
                  </div>
                  {authMode === "signup" ? (
                    <>
                      <Input
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        type="text"
                        placeholder="Full name"
                        autoComplete="name"
                      />
                      <Input
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        type="tel"
                        placeholder="Phone number"
                        autoComplete="tel"
                      />
                    </>
                  ) : null}
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    placeholder="Email"
                    autoComplete="email"
                  />
                  <Input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    placeholder="Password"
                    autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                  />
                  <Button className="w-full" onClick={() => void onEmailAuthSubmit()} disabled={isSubmittingEmailAuth}>
                    {isSubmittingEmailAuth
                      ? "Working..."
                      : authMode === "signup"
                        ? "Create account"
                        : "Sign in"}
                  </Button>
                  <div className="text-xs text-white/60">
                    Accounts created with Google should continue using Google sign-in.
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-white/15" />
                    <span className="text-xs uppercase tracking-[0.16em] text-white/55">or</span>
                    <div className="h-px flex-1 bg-white/15" />
                  </div>
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => void onGoogleSignIn()}
                    disabled={isSigningInGoogle}
                  >
                    {isSigningInGoogle ? "Redirecting..." : "Sign in with Google"}
                  </Button>
                </div>

                {authMessage ? (
                  <div
                    className={[
                      "mt-1 rounded-xl border p-3 text-sm",
                      authTone === "error"
                        ? "border-red-400/40 bg-red-500/10 text-red-100"
                        : authTone === "success"
                          ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                          : "border-white/10 bg-white/5 text-white/70",
                    ].join(" ")}
                  >
                    {authMessage}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </Card>

        {canViewGroups ? (
          <Card>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>My groups</CardTitle>
              <Button variant="ghost" onClick={() => void loadGroups()} disabled={isLoadingGroups}>
                Refresh
              </Button>
            </div>

            {message ? (
              <div
                className={[
                  "mt-3 rounded-xl border p-3 text-sm",
                  messageTone === "error"
                    ? "border-red-400/40 bg-red-500/10 text-red-100"
                    : messageTone === "success"
                      ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                      : "border-white/10 bg-white/5 text-white/70",
                ].join(" ")}
              >
                {message}
              </div>
            ) : null}

            {isLoadingGroups ? (
              <div className="mt-4 space-y-2">
                <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-white/10" />
              </div>
            ) : !hasGroups ? (
              <div className="mt-3">
                <Muted>You have no groups yet. Create one to get started.</Muted>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {groups.map((group) => (
                  <div
                    key={group.id}
                    className="rounded-xl border border-white/12 bg-black/28 p-3 transition duration-200 hover:border-white/20 hover:bg-black/35"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <Link href={`/g/${group.id}`} className="truncate text-sm font-semibold text-white hover:underline">
                          {group.name}
                        </Link>
                        <div className="mt-1 flex items-center gap-2 text-xs text-white/60">
                          <span>{new Date(group.createdAt).toLocaleDateString()}</span>
                          <Pill>{group.isHost ? "Host" : "Joined"}</Pill>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/g/${group.id}`}
                          className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15"
                        >
                          Visit
                        </Link>
                        <Button
                          variant="ghost"
                          onClick={() =>
                            setConfirmState({
                              groupId: group.id,
                              groupName: group.name,
                              action: group.isHost ? "delete" : "leave",
                            })
                          }
                        >
                          {group.isHost ? "Delete" : "Leave"}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        ) : null}
      </div>

      {confirmState ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-white/14 bg-[rgb(var(--card-2))]/95 p-4 shadow-[0_24px_54px_rgba(0,0,0,0.45)] backdrop-blur">
            <div className="text-lg font-semibold text-white">
              {confirmState.action === "delete" ? "Delete group?" : "Leave group?"}
            </div>
            <div className="mt-2 text-sm text-white/70">
              {confirmState.action === "delete"
                ? `This will remove ${confirmState.groupName} from your list and attempt to delete it for all members.`
                : `You will leave ${confirmState.groupName} and it will be removed from your list.`}
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="ghost" onClick={() => setConfirmState(null)} disabled={isActing}>
                Cancel
              </Button>
              <Button onClick={() => void onConfirmAction()} disabled={isActing}>
                {isActing
                  ? "Working..."
                  : confirmState.action === "delete"
                    ? "Delete group"
                    : "Leave group"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
