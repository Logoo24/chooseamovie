import { getTitleCacheMany, upsertTitleCache } from "@/lib/api";
import { isSupabaseConfigured } from "@/lib/supabase";
import { parseTmdbTitleKey } from "@/lib/tmdbTitleKey";

const LOCAL_TITLE_CACHE_KEY = "chooseamovie:title_cache";

export type TitleSnapshot = {
  title_id: string;
  title: string;
  year: string | null;
  media_type: "movie" | "tv";
  poster_path: string | null;
  overview?: string | null;
};

type UpsertTitleSnapshotOptions = {
  callSite?: string;
  upstreamPayloadKeys?: string[];
  tmdbSucceeded?: boolean;
};

type TmdbDetailsBody = {
  title?: string | null;
  name?: string | null;
  release_date?: string | null;
  first_air_date?: string | null;
  poster_path?: string | null;
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

function extractYear(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const match = /^(\d{4})/.exec(raw.trim());
  return match ? match[1] : null;
}

function normalizeSnapshot(titleId: string, snapshot: Partial<TitleSnapshot>): TitleSnapshot {
  const parsed = parseTmdbTitleKey(titleId);
  const mediaType = snapshot.media_type === "movie" || snapshot.media_type === "tv"
    ? snapshot.media_type
    : parsed?.type ?? "movie";
  const title = typeof snapshot.title === "string" ? snapshot.title.trim() : "";
  const posterPath = typeof snapshot.poster_path === "string" && snapshot.poster_path.trim()
    ? snapshot.poster_path
    : null;
  const overview = typeof snapshot.overview === "string" || snapshot.overview === null
    ? snapshot.overview
    : null;

  return {
    title_id: titleId,
    title: title || titleId,
    year: extractYear(snapshot.year),
    media_type: mediaType,
    poster_path: posterPath,
    overview,
  };
}

function shouldHydrateSnapshot(titleId: string, snapshot: TitleSnapshot) {
  return snapshot.title === titleId || snapshot.year === null;
}

function logSuspiciousSnapshotUpsert(
  titleId: string,
  snapshot: TitleSnapshot,
  options: UpsertTitleSnapshotOptions
) {
  if (process.env.NODE_ENV !== "development") return;
  const titleEqualsTitleId = snapshot.title === titleId;
  const hasNullYear = snapshot.year === null;
  if (!titleEqualsTitleId && !hasNullYear) return;
  console.warn("[title-cache] suspicious snapshot upsert", {
    callSite: options.callSite ?? "unknown",
    titleId,
    titleEqualsTitleId,
    hasNullYear,
    upstreamPayloadKeys: options.upstreamPayloadKeys ?? [],
  });
}

function buildSnapshotFromTmdbDetails(
  titleId: string,
  body: TmdbDetailsBody
): TitleSnapshot | null {
  const parsed = parseTmdbTitleKey(titleId);
  if (!parsed) return null;

  const title =
    parsed.type === "movie"
      ? (body.title ?? "").trim()
      : (body.name ?? "").trim();
  if (!title) return null;

  const yearRaw = parsed.type === "movie" ? body.release_date : body.first_air_date;
  return normalizeSnapshot(titleId, {
    title_id: titleId,
    title,
    year: extractYear(yearRaw),
    media_type: parsed.type,
    poster_path: body.poster_path ?? null,
    overview: body.overview ?? null,
  });
}

async function hydrateSnapshotFromTmdbDetails(titleId: string): Promise<{
  snapshot: TitleSnapshot;
  payloadKeys: string[];
} | null> {
  if (typeof window === "undefined") return null;
  const parsed = parseTmdbTitleKey(titleId);
  if (!parsed) return null;

  const response = await fetch(`/api/tmdb/details?type=${parsed.type}&id=${parsed.id}`);
  if (!response.ok) return null;

  const body = (await response.json()) as TmdbDetailsBody;
  const snapshot = buildSnapshotFromTmdbDetails(titleId, body);
  if (!snapshot) return null;

  return {
    snapshot,
    payloadKeys: Object.keys(body ?? {}),
  };
}

export async function upsertTitleSnapshot(
  titleId: string,
  snapshot: TitleSnapshot,
  options: UpsertTitleSnapshotOptions = {}
): Promise<void> {
  const id = titleId.trim();
  if (!id) return;

  const normalized = normalizeSnapshot(id, snapshot);
  logSuspiciousSnapshotUpsert(id, normalized, options);

  // Do not write placeholder title_ids as titles unless the caller explicitly indicates TMDB failed.
  if (normalized.title === id && options.tmdbSucceeded !== false) return;

  upsertLocalSnapshot(id, normalized);

  if (!isSupabaseConfigured()) return;

  await upsertTitleCache(id, normalized as unknown as Record<string, unknown>);
}

export async function getTitleSnapshots(titleIds: string[]): Promise<Record<string, TitleSnapshot>> {
  const deduped = Array.from(new Set(titleIds.map((id) => id.trim()).filter(Boolean)));
  if (deduped.length === 0) return {};

  const local = loadLocalCache();
  const found: Record<string, TitleSnapshot> = {};
  const nextLocal = { ...local };
  const missingFromSupabase: string[] = [];
  const toHydrate = new Set<string>();

  for (const id of deduped) {
    const localSnapshot = local[id];
    if (!localSnapshot) {
      missingFromSupabase.push(id);
      continue;
    }

    const normalized = normalizeSnapshot(id, localSnapshot);
    found[id] = normalized;
    nextLocal[id] = normalized;
    if (shouldHydrateSnapshot(id, normalized)) {
      toHydrate.add(id);
    }
  }

  if (isSupabaseConfigured() && missingFromSupabase.length > 0) {
    const remote = await getTitleCacheMany(missingFromSupabase);
    if (!remote.error) {
      for (const row of remote.data ?? []) {
        const id = String(row.title_id);
        const snapshot = row.snapshot as Partial<TitleSnapshot> | null;
        if (!snapshot) continue;
        const normalized = normalizeSnapshot(id, snapshot);
        found[id] = normalized;
        nextLocal[id] = normalized;
        if (shouldHydrateSnapshot(id, normalized)) {
          toHydrate.add(id);
        }
      }
    }
  }

  for (const id of deduped) {
    if (!found[id]) {
      toHydrate.add(id);
    }
  }

  if (typeof window !== "undefined" && toHydrate.size > 0) {
    const hydrated = await Promise.all(
      Array.from(toHydrate).map(async (id) => {
        const resolved = await hydrateSnapshotFromTmdbDetails(id);
        if (!resolved) return null;
        await upsertTitleSnapshot(id, resolved.snapshot, {
          callSite: "titleCacheStore.hydrateFromTmdbDetails",
          upstreamPayloadKeys: resolved.payloadKeys,
          tmdbSucceeded: true,
        });
        return { id, snapshot: resolved.snapshot };
      })
    );

    for (const item of hydrated) {
      if (!item) continue;
      found[item.id] = item.snapshot;
      nextLocal[item.id] = item.snapshot;
    }
  }

  saveLocalCache(nextLocal);
  return found;
}
