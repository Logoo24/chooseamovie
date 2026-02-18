import { ensureAnonymousSession, supabase } from "@/lib/supabase";
import { loadRatings } from "@/lib/ratings";
import type { GroupSettings } from "@/lib/storage";
import { buildTmdbTitleKey } from "@/lib/tmdbTitleKey";

const KEY_UPCOMING = (groupId: string, memberId: string) =>
  `chooseamovie:endless:upcoming:${groupId}:${memberId}`;
const KEY_SEEN_TITLE_IDS = (groupId: string, memberId: string) =>
  `chooseamovie:endless:seenTitleIds:${groupId}:${memberId}`;
const KEY_SEEN_LEGACY = (groupId: string, memberId: string) =>
  `chooseamovie:endless:seen:${groupId}:${memberId}`;

const MIN_UPCOMING = 4;
const TARGET_UPCOMING = 10;
const MAX_SEEN = 300;

type TrendingType = "movie" | "tv";

export type EndlessQueueItem = {
  title_id: string;
  type: TrendingType;
  id: number;
  title: string;
  year: string | null;
  poster_path: string | null;
  overview: string;
};

type TrendingResult = {
  id: number;
  type: "movie" | "tv";
  title_key?: string | null;
  title?: string | null;
  year?: string | null;
  poster_path?: string | null;
  overview?: string | null;
};

type TrendingResponse = {
  results?: TrendingResult[];
};

function loadLocalArray(key: string): string[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalArray(key: string, values: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(values));
}

type StoredQueueItem = EndlessQueueItem & { title_key?: string };

function normalizeUpcomingItem(item: StoredQueueItem): EndlessQueueItem | null {
  const titleId = item.title_id?.trim() || item.title_key?.trim() || "";
  if (!titleId) return null;
  return {
    title_id: titleId,
    type: item.type,
    id: item.id,
    title: item.title,
    year: item.year ?? null,
    poster_path: item.poster_path ?? null,
    overview: item.overview ?? "",
  };
}

function loadUpcoming(groupId: string, memberId: string): EndlessQueueItem[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(KEY_UPCOMING(groupId, memberId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as StoredQueueItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeUpcomingItem)
      .filter((item): item is EndlessQueueItem => Boolean(item));
  } catch {
    return [];
  }
}

function saveUpcoming(groupId: string, memberId: string, items: EndlessQueueItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_UPCOMING(groupId, memberId), JSON.stringify(items));
}

function loadSeen(groupId: string, memberId: string): string[] {
  const current = loadLocalArray(KEY_SEEN_TITLE_IDS(groupId, memberId));
  if (current.length > 0) return current;
  const legacy = loadLocalArray(KEY_SEEN_LEGACY(groupId, memberId));
  if (legacy.length > 0) {
    saveSeen(groupId, memberId, legacy);
    if (typeof window !== "undefined") {
      localStorage.removeItem(KEY_SEEN_LEGACY(groupId, memberId));
    }
  }
  return legacy;
}

function saveSeen(groupId: string, memberId: string, seen: string[]) {
  saveLocalArray(KEY_SEEN_TITLE_IDS(groupId, memberId), seen.slice(-MAX_SEEN));
}

function localRatedTitleKeys(groupId: string, memberId: string) {
  return new Set(Object.keys(loadRatings(groupId, memberId)));
}

async function remoteRatedTitleKeys(groupId: string, memberId: string) {
  if (!supabase) return new Set<string>();

  await ensureAnonymousSession();
  try {
    const { data, error } = await supabase
      .from("ratings")
      .select("title_id")
      .eq("group_id", groupId)
      .eq("member_id", memberId);

    if (error) return new Set<string>();
    return new Set((data ?? []).map((row) => String(row.title_id)));
  } catch {
    return new Set<string>();
  }
}

async function fetchTrendingBucket(type: "all" | "movie" | "tv", window: "day" | "week") {
  const response = await fetch(`/api/tmdb/trending?type=${type}&window=${window}`);
  const body = (await response.json()) as TrendingResponse;
  if (!response.ok) return [];
  return body.results ?? [];
}

async function fetchTrendingCandidates(contentType: GroupSettings["contentType"]) {
  const requests =
    contentType === "movies"
      ? [
          fetchTrendingBucket("movie", "week"),
          fetchTrendingBucket("movie", "day"),
        ]
      : [
          fetchTrendingBucket("all", "week"),
          fetchTrendingBucket("all", "day"),
        ];

  const results = await Promise.all(requests);
  const merged = results.flat();
  const byKey = new Map<string, EndlessQueueItem>();

  for (const row of merged) {
    if (row.type !== "movie" && row.type !== "tv") continue;
    const titleId = row.title_key?.trim() || buildTmdbTitleKey(row.type, row.id);
    if (!titleId) continue;
    if (!byKey.has(titleId)) {
      byKey.set(titleId, {
        title_id: titleId,
        type: row.type,
        id: row.id,
        title: row.title ?? "Untitled",
        year: row.year ?? null,
        poster_path: row.poster_path ?? null,
        overview: row.overview ?? "",
      });
    }
  }

  return Array.from(byKey.values());
}

export function getUpcomingQueue(groupId: string, memberId: string) {
  return loadUpcoming(groupId, memberId);
}

export async function ensureEndlessQueue(
  groupId: string,
  memberId: string,
  settings: GroupSettings
): Promise<EndlessQueueItem[]> {
  const seen = new Set(loadSeen(groupId, memberId));
  const ratedLocal = localRatedTitleKeys(groupId, memberId);
  const ratedRemote = await remoteRatedTitleKeys(groupId, memberId);
  const rated = new Set([...ratedLocal, ...ratedRemote]);

  const dedupedUpcoming = loadUpcoming(groupId, memberId).filter((item) => {
    return !seen.has(item.title_id) && !rated.has(item.title_id);
  });

  if (dedupedUpcoming.length >= MIN_UPCOMING) {
    saveUpcoming(groupId, memberId, dedupedUpcoming);
    return dedupedUpcoming;
  }

  const candidates = await fetchTrendingCandidates(settings.contentType);
  const existing = new Set(dedupedUpcoming.map((item) => item.title_id));
  const next = [...dedupedUpcoming];

  for (const item of candidates) {
    if (next.length >= TARGET_UPCOMING) break;
    if (existing.has(item.title_id)) continue;
    if (seen.has(item.title_id)) continue;
    if (rated.has(item.title_id)) continue;
    next.push(item);
    existing.add(item.title_id);
  }

  saveUpcoming(groupId, memberId, next);
  return next;
}

export function consumeUpcomingTitle(groupId: string, memberId: string, titleId: string) {
  const queue = loadUpcoming(groupId, memberId).filter((item) => item.title_id !== titleId);
  saveUpcoming(groupId, memberId, queue);

  const seen = loadSeen(groupId, memberId);
  if (!seen.includes(titleId)) {
    seen.push(titleId);
    saveSeen(groupId, memberId, seen);
  }
}
