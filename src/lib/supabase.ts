import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function isValidSupabaseUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

let client = null;

if (isValidSupabaseUrl(url) && typeof anonKey === "string" && typeof url === "string") {
  client = createClient(url, anonKey);
}

export const supabase = client;

let reachabilityCache: boolean | null = null;
let reachabilityInFlight: Promise<boolean> | null = null;

export function isSupabaseConfigured() {
  return Boolean(supabase);
}

export async function checkSupabaseReachable(force = false): Promise<boolean> {
  if (!supabase) return false;
  if (!force && reachabilityCache !== null) return reachabilityCache;
  if (!force && reachabilityInFlight) return reachabilityInFlight;

  reachabilityInFlight = (async () => {
    try {
      const { error } = await supabase
        .from("groups")
        .select("id", { head: true, count: "exact" })
        .limit(1);
      const ok = !error;
      reachabilityCache = ok;
      return ok;
    } catch {
      reachabilityCache = false;
      return false;
    } finally {
      reachabilityInFlight = null;
    }
  })();

  return reachabilityInFlight;
}

export async function ensureAnonymousSession(): Promise<string | null> {
  if (!supabase) return null;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const existingUserId = sessionData.session?.user?.id ?? null;
    if (existingUserId) return existingUserId;

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) return null;
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}
