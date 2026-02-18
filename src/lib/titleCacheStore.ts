import { ensureAnonymousSession, supabase } from "@/lib/supabase";

const TITLE_CACHE_TABLE = "title_cache";
const LOCAL_TITLE_CACHE_KEY = "chooseamovie:title_cache";

export type TitleSnapshot = {
  title_id: string;
  title: string;
  year: string | null;
  media_type: "movie" | "tv";
  poster_path: string | null;
  overview?: string | null;
};

function loadLocalCache(): Record<string, TitleSnapshot> {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(LOCAL_TITLE_CACHE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, TitleSnapshot>;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function saveLocalCache(next: Record<string, TitleSnapshot>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_TITLE_CACHE_KEY, JSON.stringify(next));
}

function upsertLocalSnapshot(titleId: string, snapshot: TitleSnapshot) {
  const cache = loadLocalCache();
  cache[titleId] = snapshot;
  saveLocalCache(cache);
}

export async function upsertTitleSnapshot(titleId: string, snapshot: TitleSnapshot): Promise<void> {
  const id = titleId.trim();
  if (!id) return;
  upsertLocalSnapshot(id, { ...snapshot, title_id: id });

  if (!supabase) return;
  await ensureAnonymousSession();

  try {
    await supabase.from(TITLE_CACHE_TABLE).upsert(
      {
        title_id: id,
        snapshot: { ...snapshot, title_id: id },
      },
      { onConflict: "title_id" }
    );
  } catch {
    try {
      // Backward-compatible fallback for older schema naming.
      await supabase.from(TITLE_CACHE_TABLE).upsert(
        {
          title_id: id,
          title_snapshot: { ...snapshot, title_id: id },
        },
        { onConflict: "title_id" }
      );
    } catch {
      // local snapshot remains available
    }
  }
}

export async function getTitleSnapshots(titleIds: string[]): Promise<Record<string, TitleSnapshot>> {
  const deduped = Array.from(new Set(titleIds.map((id) => id.trim()).filter(Boolean)));
  if (deduped.length === 0) return {};

  const local = loadLocalCache();
  const found: Record<string, TitleSnapshot> = {};
  const missing: string[] = [];

  for (const id of deduped) {
    const snapshot = local[id];
    if (snapshot) found[id] = snapshot;
    else missing.push(id);
  }

  if (!supabase || missing.length === 0) return found;
  await ensureAnonymousSession();

  try {
    const primary = await supabase
      .from(TITLE_CACHE_TABLE)
      .select("title_id, snapshot")
      .in("title_id", missing);
    const fallback =
      primary.error
        ? await supabase.from(TITLE_CACHE_TABLE).select("title_id, title_snapshot").in("title_id", missing)
        : null;
    const data = !primary.error ? primary.data : fallback?.data;
    const error = !primary.error ? null : fallback?.error;
    if (error) return found;

    const nextLocal = { ...local };
    for (const row of data ?? []) {
      const id = String(row.title_id);
      const snapshot = ((row as { snapshot?: TitleSnapshot; title_snapshot?: TitleSnapshot }).snapshot ??
        (row as { snapshot?: TitleSnapshot; title_snapshot?: TitleSnapshot }).title_snapshot) as
        | TitleSnapshot
        | undefined;
      if (!snapshot) continue;
      const normalized: TitleSnapshot = { ...snapshot, title_id: id };
      found[id] = normalized;
      nextLocal[id] = normalized;
    }
    saveLocalCache(nextLocal);
    return found;
  } catch {
    return found;
  }
}
