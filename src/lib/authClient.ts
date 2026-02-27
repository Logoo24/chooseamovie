import type { Session } from "@supabase/supabase-js";
import { ensureAuth } from "@/lib/api";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export type AuthSnapshot = {
  userId: string | null;
  email: string | null;
  provider: string | null;
  hasSession: boolean;
  isAnonymous: boolean;
  displayName?: string | null;
  firstName?: string | null;
  phoneNumber?: string | null;
};

type AuthResult = {
  ok: boolean;
  error: string | null;
  requiresEmailConfirmation?: boolean;
};

type AccountUpdateInput = {
  displayName?: string | null;
  phoneNumber?: string | null;
};

function readUserString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function deriveFirstName(displayName: string | null): string | null {
  if (!displayName) return null;
  const [first = ""] = displayName.split(/\s+/);
  const trimmed = first.trim();
  return trimmed ? trimmed : null;
}

function deriveFirstNameFromEmail(email: string | null): string | null {
  if (!email) return null;
  const local = email.split("@")[0]?.trim() ?? "";
  if (!local) return null;
  return local.slice(0, 1).toUpperCase() + local.slice(1);
}

function toAuthSnapshot(session: Session | null): AuthSnapshot {
  const user = session?.user ?? null;
  const providerRaw =
    typeof user?.app_metadata?.provider === "string" ? user.app_metadata.provider : null;
  const provider = providerRaw && providerRaw.trim() ? providerRaw.trim() : null;
  const metadata = user?.user_metadata ?? {};
  const displayName =
    readUserString((metadata as Record<string, unknown>).display_name) ??
    readUserString((metadata as Record<string, unknown>).full_name) ??
    readUserString((metadata as Record<string, unknown>).name);
  const phoneNumber =
    readUserString((metadata as Record<string, unknown>).phone_number) ??
    readUserString((metadata as Record<string, unknown>).phone);
  const isAnonymous =
    Boolean(user?.is_anonymous) || provider === "anonymous" || provider === "anon";

  return {
    userId: user?.id ?? null,
    email: user?.email ?? null,
    provider,
    hasSession: Boolean(user),
    isAnonymous,
    displayName,
    firstName: deriveFirstName(displayName) ?? deriveFirstNameFromEmail(user?.email ?? null),
    phoneNumber,
  };
}

export async function getAuthSnapshot(): Promise<AuthSnapshot> {
  if (!isSupabaseConfigured() || !supabase) {
    return {
      userId: null,
      email: null,
      provider: null,
      hasSession: false,
      isAnonymous: false,
      displayName: null,
      firstName: null,
      phoneNumber: null,
    };
  }

  const { data } = await supabase.auth.getSession();
  return toAuthSnapshot(data.session ?? null);
}

export function subscribeAuthSnapshot(onChange: (snapshot: AuthSnapshot) => void) {
  if (!isSupabaseConfigured() || !supabase) {
    return () => {};
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    onChange(toAuthSnapshot(session));
  });

  return () => {
    subscription.unsubscribe();
  };
}

export async function continueAsGuest(): Promise<AuthResult> {
  const userId = await ensureAuth();
  if (!userId) {
    return { ok: false, error: "Could not start a guest session right now." };
  }
  return { ok: true, error: null };
}

export async function sendMagicLink(email: string, redirectTo: string): Promise<AuthResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Supabase auth is not configured." };
  }

  const trimmed = email.trim();
  if (!trimmed) {
    return { ok: false, error: "Enter an email address." };
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: trimmed,
    options: {
      emailRedirectTo: redirectTo,
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, error: null };
}

export async function signInWithGoogle(redirectTo: string): Promise<AuthResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Supabase auth is not configured." };
  }

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, error: null };
}

export async function signUpWithEmailPassword(input: {
  email: string;
  password: string;
  fullName: string;
  phoneNumber: string;
  redirectTo: string;
}): Promise<AuthResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Supabase auth is not configured." };
  }

  const email = input.email.trim();
  const password = input.password;
  const fullName = input.fullName.trim();
  const phoneNumber = input.phoneNumber.trim();

  if (!fullName) return { ok: false, error: "Enter your name." };
  if (!phoneNumber) return { ok: false, error: "Enter your phone number." };
  if (!email) return { ok: false, error: "Enter an email address." };
  if (!password) return { ok: false, error: "Enter a password." };
  if (password.length < 8) return { ok: false, error: "Password must be at least 8 characters." };

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: input.redirectTo,
      data: {
        display_name: fullName,
        phone_number: phoneNumber,
      },
    },
  });

  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    error: null,
    requiresEmailConfirmation: !data.session,
  };
}

export async function signInWithEmailPassword(email: string, password: string): Promise<AuthResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Supabase auth is not configured." };
  }

  const trimmed = email.trim();
  if (!trimmed) return { ok: false, error: "Enter your email address." };
  if (!password) return { ok: false, error: "Enter your password." };

  const { error } = await supabase.auth.signInWithPassword({
    email: trimmed,
    password,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
}

export async function signOutCurrentUser(): Promise<AuthResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Supabase auth is not configured." };
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, error: null };
}

export async function signOutAllSessions(): Promise<AuthResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Supabase auth is not configured." };
  }

  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, error: null };
}

export async function updateAccountProfile(input: AccountUpdateInput): Promise<AuthResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Supabase auth is not configured." };
  }

  const displayName = input.displayName?.trim() ?? "";
  const phoneNumber = input.phoneNumber?.trim() ?? "";

  const profileResult = await bootstrapSignedInProfile({
    displayName: displayName || null,
  });
  if (!profileResult.ok) {
    return profileResult;
  }

  const { error } = await supabase.auth.updateUser({
    data: {
      display_name: displayName || null,
      phone_number: phoneNumber || null,
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, error: null };
}

export async function changeMyPassword(newPassword: string): Promise<AuthResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Supabase auth is not configured." };
  }

  const trimmed = newPassword.trim();
  if (trimmed.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters." };
  }

  const { error } = await supabase.auth.updateUser({ password: trimmed });
  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, error: null };
}

export async function deleteMyAccount(): Promise<AuthResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Supabase auth is not configured." };
  }

  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    return { ok: false, error: error.message };
  }

  await supabase.auth.signOut({ scope: "local" });
  return { ok: true, error: null };
}

export async function bootstrapSignedInProfile(input?: {
  displayName?: string | null;
  avatarUrl?: string | null;
}): Promise<AuthResult> {
  if (!isSupabaseConfigured() || !supabase) {
    return { ok: false, error: "Supabase auth is not configured." };
  }

  const snapshot = await getAuthSnapshot();
  if (!snapshot.hasSession || snapshot.isAnonymous) {
    return { ok: true, error: null };
  }

  const { error } = await supabase.rpc("upsert_my_profile", {
    p_display_name: input?.displayName ?? snapshot.displayName ?? null,
    p_avatar_url: input?.avatarUrl ?? null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, error: null };
}
