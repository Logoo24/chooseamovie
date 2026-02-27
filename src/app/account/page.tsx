"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { StateCard } from "@/components/StateCard";
import { Button, Card, CardTitle, Input, Muted, Pill } from "@/components/ui";
import {
  changeMyPassword,
  deleteMyAccount,
  getAuthSnapshot,
  signOutAllSessions,
  subscribeAuthSnapshot,
  updateAccountProfile,
  type AuthSnapshot,
} from "@/lib/authClient";

const INITIAL_AUTH: AuthSnapshot = {
  userId: null,
  email: null,
  provider: null,
  hasSession: false,
  isAnonymous: false,
  displayName: null,
  firstName: null,
};

export default function AccountPage() {
  const [auth, setAuth] = useState<AuthSnapshot>(INITIAL_AUTH);
  const [isReady, setIsReady] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [phoneDraft, setPhoneDraft] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isSigningOutEverywhere, setIsSigningOutEverywhere] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [notice, setNotice] = useState<{ tone: "info" | "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void getAuthSnapshot().then((snapshot) => {
      if (!alive) return;
      setAuth(snapshot);
      setDisplayNameDraft(snapshot.displayName ?? "");
      setPhoneDraft(snapshot.phoneNumber ?? "");
      setIsReady(true);
    });

    const unsubscribe = subscribeAuthSnapshot((snapshot) => {
      setAuth(snapshot);
      setDisplayNameDraft(snapshot.displayName ?? "");
      setPhoneDraft(snapshot.phoneNumber ?? "");
      setIsReady(true);
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  if (isReady && (!auth.hasSession || auth.isAnonymous)) {
    return (
      <AppShell>
        <StateCard
          title="Sign in to view your account"
          description="You need to sign in to manage your account details."
          actionHref="/signin?next=%2Faccount"
          actionLabel="Sign in"
        />
      </AppShell>
    );
  }

  const isGoogleAccount = auth.provider === "google";

  async function onSaveProfile() {
    if (isSavingProfile) return;
    setIsSavingProfile(true);
    setNotice(null);
    try {
      const result = await updateAccountProfile({
        displayName: displayNameDraft,
        phoneNumber: phoneDraft,
      });
      if (!result.ok) {
        setNotice({ tone: "error", text: result.error ?? "Could not update profile." });
        return;
      }
      setNotice({ tone: "success", text: "Profile updated." });
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function onChangePassword() {
    if (isChangingPassword) return;
    if (newPassword !== confirmPassword) {
      setNotice({ tone: "error", text: "New password and confirmation do not match." });
      return;
    }
    setIsChangingPassword(true);
    setNotice(null);
    try {
      const result = await changeMyPassword(newPassword);
      if (!result.ok) {
        setNotice({ tone: "error", text: result.error ?? "Could not change password." });
        return;
      }
      setNewPassword("");
      setConfirmPassword("");
      setNotice({ tone: "success", text: "Password updated." });
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function onSignOutAllSessions() {
    if (isSigningOutEverywhere) return;
    setIsSigningOutEverywhere(true);
    setNotice(null);
    try {
      const result = await signOutAllSessions();
      if (!result.ok) {
        setNotice({ tone: "error", text: result.error ?? "Could not sign out all sessions." });
        return;
      }
      setNotice({ tone: "success", text: "Signed out on all devices." });
    } finally {
      setIsSigningOutEverywhere(false);
    }
  }

  async function onDeleteAccount() {
    if (isDeletingAccount) return;
    if (deleteConfirmText.trim().toUpperCase() !== "DELETE") {
      setNotice({ tone: "error", text: "Type DELETE to confirm account deletion." });
      return;
    }
    if (!window.confirm("This will permanently delete your account and data. Continue?")) {
      return;
    }
    setIsDeletingAccount(true);
    setNotice(null);
    try {
      const result = await deleteMyAccount();
      if (!result.ok) {
        setNotice({ tone: "error", text: result.error ?? "Could not delete account." });
        return;
      }
      window.location.assign("/");
    } finally {
      setIsDeletingAccount(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
          <Pill>Account</Pill>
        </div>

        <Card>
          <CardTitle>Account details</CardTitle>
          {!isReady ? (
            <div className="mt-3">
              <Muted>Loading account...</Muted>
            </div>
          ) : (
            <div className="mt-3 space-y-2 text-sm text-white/80">
              <div>
                <span className="text-white/55">Name:</span>{" "}
                {auth.displayName ?? auth.firstName ?? "Not set"}
              </div>
              <div>
                <span className="text-white/55">Email:</span> {auth.email ?? "Not available"}
              </div>
              <div>
                <span className="text-white/55">Provider:</span> {auth.provider ?? "email"}
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>Profile settings</CardTitle>
          <div className="mt-3 space-y-3">
            <Input
              value={displayNameDraft}
              onChange={(e) => setDisplayNameDraft(e.target.value)}
              placeholder="Display name"
              autoComplete="name"
            />
            <Input
              value={phoneDraft}
              onChange={(e) => setPhoneDraft(e.target.value)}
              placeholder="Phone number"
              autoComplete="tel"
            />
            <div>
              <Button onClick={() => void onSaveProfile()} disabled={isSavingProfile}>
                {isSavingProfile ? "Saving..." : "Save profile"}
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>Password</CardTitle>
          {isGoogleAccount ? (
            <div className="mt-2">
              <Muted>
                This account uses Google sign-in. Password changes are managed through your Google account.
              </Muted>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <Input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                type="password"
                placeholder="New password"
                autoComplete="new-password"
              />
              <Input
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                type="password"
                placeholder="Confirm new password"
                autoComplete="new-password"
              />
              <div>
                <Button onClick={() => void onChangePassword()} disabled={isChangingPassword}>
                  {isChangingPassword ? "Updating..." : "Change password"}
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>Session security</CardTitle>
          <div className="mt-3">
            <Button variant="secondary" onClick={() => void onSignOutAllSessions()} disabled={isSigningOutEverywhere}>
              {isSigningOutEverywhere ? "Signing out..." : "Sign out on all devices"}
            </Button>
          </div>
        </Card>

        <Card>
          <CardTitle>Danger zone</CardTitle>
          <div className="mt-2">
            <Muted>Permanently delete your account and remove access to your groups.</Muted>
          </div>
          <div className="mt-3 space-y-3">
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder='Type "DELETE" to confirm'
              autoComplete="off"
            />
            <div>
              <Button variant="ghost" onClick={() => void onDeleteAccount()} disabled={isDeletingAccount}>
                {isDeletingAccount ? "Deleting..." : "Delete account"}
              </Button>
            </div>
          </div>
        </Card>

        {notice ? (
          <div
            className={[
              "rounded-xl border p-3 text-sm",
              notice.tone === "error"
                ? "border-red-400/40 bg-red-500/10 text-red-100"
                : notice.tone === "success"
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                  : "border-white/10 bg-white/5 text-white/70",
            ].join(" ")}
          >
            {notice.text}
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
