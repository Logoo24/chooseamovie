import { listRatingsForMember } from "@/lib/api";
import { loadRatings } from "@/lib/ratings";
import {
  getEndlessSettings,
  loadGroup,
  normalizeGroupSettings,
  type GroupSettings,
} from "@/lib/storage";
import { isSupabaseConfigured } from "@/lib/supabase";
import { buildTmdbTitleKey } from "@/lib/tmdbTitleKey";

const KEY_UPCOMING = (groupId: string, memberId: string) =>
  `chooseamovie:endless:upcoming:${groupId}:${memberId}`;
const KEY_SEEN_TITLE_IDS = (groupId: string, memberId: string) =>
  `chooseamovie:endless:seenTitleIds:${groupId}:${memberId}`;
const KEY_SEEN_LEGACY = (groupId: string, memberId: string) =>
  `chooseamovie:endless:seen:${groupId}:${memberId}`;
const KEY_DISCOVER_STATE = (groupId: string, memberId: string) =>
  `chooseamovie:endless:discoverState:${groupId}:${memberId}`;

const LOW_WATERMARK = 10;
const TARGET_SIZE = 80;
const MAX_PAGES_PER_REFILL = 5;
const MAX_SEEN = 300;
const noDiscoverResultsHintShownForGroup = new Set<string>();
const movieMpaaById = new Map<number, string | null>();

type TrendingType = "movie" | "tv";

export type EndlessQueueItem = {
  title_id: string;
  type: TrendingType;
  id: number;
  title: string;
  year: string | null;
  poster_path: string | null;
  overview: string;
  tmdb_payload_keys?: string[];
};

type TrendingResult = {
  id: number;
  type: "movie" | "tv";
  title_key?: string | null;
  title?: string | null;
  year?: string | null;
  release_date?: string | null;
  vote_count?: number | null;
  poster_path?: string | null;
  overview?: string | null;
};

type TrendingResponse = {
  page?: number;
  total_pages?: number;
  results?: TrendingResult[];
};

type TmdbMovieDetailsRatingResponse = {
  mpaa_rating?: string | null;
};

type DiscoverState = {
  settingsKey: string;
  nextPageByType: Record<TrendingType, number>;
  exhaustedByType: Record<TrendingType, boolean>;
};

function normalizeMpaa(certification: string | null | undefined): "G" | "PG" | "PG-13" | "R" | null {
  const raw = (certification ?? "").trim().toUpperCase();
  if (!raw) return null;
  if (raw === "PG13") return "PG-13";
  if (raw === "G" || raw === "PG" || raw === "PG-13" || raw === "R") return raw;
  return null;
}

function shouldFilterByMovieRating(settings: GroupSettings) {
  return !(
    settings.allowG &&
    settings.allowPG &&
    settings.allowPG13 &&
    settings.allowR
  );
}

function isAllowedMovieRating(settings: GroupSettings, rating: "G" | "PG" | "PG-13" | "R" | null) {
  if (!rating) return true;
  if (rating === "G") return settings.allowG;
  if (rating === "PG") return settings.allowPG;
  if (rating === "PG-13") return settings.allowPG13;
  return settings.allowR;
}

async function fetchMovieMpaaRating(tmdbId: number): Promise<"G" | "PG" | "PG-13" | "R" | null> {
  if (movieMpaaById.has(tmdbId)) {
    return normalizeMpaa(movieMpaaById.get(tmdbId) ?? null);
  }

  try {
    const response = await fetch(`/api/tmdb/details?type=movie&id=${tmdbId}`);
    if (!response.ok) {
      movieMpaaById.set(tmdbId, null);
      return null;
    }
    const body = (await response.json()) as TmdbMovieDetailsRatingResponse;
    const normalized = normalizeMpaa(body.mpaa_rating ?? null);
    movieMpaaById.set(tmdbId, normalized);
    return normalized;
  } catch {
    movieMpaaById.set(tmdbId, null);
    return null;
  }
}

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

function createDefaultDiscoverState(settingsKey: string): DiscoverState {
  return {
    settingsKey,
    nextPageByType: { movie: 1, tv: 1 },
    exhaustedByType: { movie: false, tv: false },
  };
}

function endlessSettingsKey(settings: GroupSettings) {
  const endless = getEndlessSettings(settings);
  return JSON.stringify({
    mediaType: endless.mediaType,
    filterUnpopular: endless.filterUnpopular,
    minVoteCount: endless.filterUnpopular ? endless.minVoteCount ?? 200 : null,
    excludedGenreIds: endless.excludedGenreIds,
    releaseFrom: endless.releaseFrom,
    releaseTo: endless.releaseTo,
    allowG: settings.allowG,
    allowPG: settings.allowPG,
    allowPG13: settings.allowPG13,
    allowR: settings.allowR,
  });
}

function loadDiscoverState(groupId: string, memberId: string, settings: GroupSettings): DiscoverState {
  if (typeof window === "undefined") {
    return createDefaultDiscoverState(endlessSettingsKey(settings));
  }

  const settingsKey = endlessSettingsKey(settings);
  const raw = localStorage.getItem(KEY_DISCOVER_STATE(groupId, memberId));
  if (!raw) return createDefaultDiscoverState(settingsKey);

  try {
    const parsed = JSON.parse(raw) as Partial<DiscoverState>;
    if (parsed.settingsKey !== settingsKey) {
      return createDefaultDiscoverState(settingsKey);
    }
    return {
      settingsKey,
      nextPageByType: {
        movie:
          typeof parsed.nextPageByType?.movie === "number" && parsed.nextPageByType.movie >= 1
            ? Math.floor(parsed.nextPageByType.movie)
            : 1,
        tv:
          typeof parsed.nextPageByType?.tv === "number" && parsed.nextPageByType.tv >= 1
            ? Math.floor(parsed.nextPageByType.tv)
            : 1,
      },
      exhaustedByType: {
        movie: Boolean(parsed.exhaustedByType?.movie),
        tv: Boolean(parsed.exhaustedByType?.tv),
      },
    };
  } catch {
    return createDefaultDiscoverState(settingsKey);
  }
}

function saveDiscoverState(groupId: string, memberId: string, state: DiscoverState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_DISCOVER_STATE(groupId, memberId), JSON.stringify(state));
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
    tmdb_payload_keys: Array.isArray(item.tmdb_payload_keys)
      ? item.tmdb_payload_keys.filter((key): key is string => typeof key === "string")
      : [],
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
  if (!isSupabaseConfigured()) return new Set<string>();

  const remote = await listRatingsForMember(groupId, memberId);
  if (remote.error) return new Set<string>();
  return new Set((remote.data ?? []).map((row) => String(row.title_id)));
}

async function fetchDiscoverPage(
  type: "movie" | "tv",
  page: number,
  options: {
    minVoteCount: number | null;
    excludedGenreIds: number[];
    releaseFrom: string | null;
    releaseTo: string | null;
  }
) {
  const params = new URLSearchParams({
    type,
    page: String(page),
  });
  if (options.minVoteCount !== null) {
    params.set("minVoteCount", String(options.minVoteCount));
  }
  if (options.excludedGenreIds.length > 0) {
    params.set("excludedGenreIds", options.excludedGenreIds.join(","));
  }
  if (options.releaseFrom) {
    params.set("releaseFrom", options.releaseFrom);
  }
  if (options.releaseTo) {
    params.set("releaseTo", options.releaseTo);
  }

  const response = await fetch(`/api/tmdb/discover?${params.toString()}`);
  const body = (await response.json()) as TrendingResponse;
  if (!response.ok) {
    return {
      ok: false,
      rows: [] as TrendingResult[],
      noMore: false,
    };
  }
  const rows = body.results ?? [];
  const pageValue = typeof body.page === "number" ? body.page : page;
  const totalPages = typeof body.total_pages === "number" ? body.total_pages : null;
  const noMore = rows.length === 0 || (totalPages !== null && pageValue >= totalPages);
  return {
    ok: true,
    rows,
    noMore,
  };
}

function discoverTypesForSettings(settings: GroupSettings): Array<"movie" | "tv"> {
  const endlessSettings = getEndlessSettings(settings);
  return endlessSettings.mediaType === "movies_and_tv"
    ? ["movie", "tv"]
    : endlessSettings.mediaType === "tv"
      ? ["tv"]
      : ["movie"];
}

async function filterDiscoverRows(
  rows: TrendingResult[],
  settings: GroupSettings
): Promise<EndlessQueueItem[]> {
  const endlessSettings = getEndlessSettings(settings);
  const minVoteCount = endlessSettings.filterUnpopular ? endlessSettings.minVoteCount ?? 200 : null;
  const byKey = new Map<string, EndlessQueueItem>();
  const enforceMovieRatings = shouldFilterByMovieRating(settings);
  let movieRatings = new Map<number, "G" | "PG" | "PG-13" | "R" | null>();

  if (enforceMovieRatings) {
    const movieIds = Array.from(new Set(rows.filter((row) => row.type === "movie").map((row) => row.id)));
    const ratingPairs = await Promise.all(
      movieIds.map(async (id) => [id, await fetchMovieMpaaRating(id)] as const)
    );
    movieRatings = new Map(ratingPairs);
  }

  for (const row of rows) {
    if (row.type !== "movie" && row.type !== "tv") continue;
    if (minVoteCount !== null && typeof row.vote_count === "number" && row.vote_count < minVoteCount) {
      continue;
    }
    if (endlessSettings.releaseFrom || endlessSettings.releaseTo) {
      if (!row.release_date) continue;
      if (endlessSettings.releaseFrom && row.release_date < endlessSettings.releaseFrom) continue;
      if (endlessSettings.releaseTo && row.release_date > endlessSettings.releaseTo) continue;
    }
    if (enforceMovieRatings && row.type === "movie") {
      const rating = movieRatings.get(row.id) ?? null;
      if (!isAllowedMovieRating(settings, rating)) continue;
    }
    const titleId = row.title_key?.trim() || buildTmdbTitleKey(row.type, row.id);
    if (!titleId) continue;
    const title = (row.title ?? "").trim();
    if (!title) continue;
    if (!row.poster_path) continue;
    if (!byKey.has(titleId)) {
      byKey.set(titleId, {
        title_id: titleId,
        type: row.type,
        id: row.id,
        title,
        year: row.year ?? null,
        poster_path: row.poster_path,
        overview: row.overview ?? "",
        tmdb_payload_keys: Object.keys(row),
      });
    }
  }

  return Array.from(byKey.values());
}

async function refillUpcomingQueue(
  groupId: string,
  memberId: string,
  settings: GroupSettings,
  seedQueue: EndlessQueueItem[],
  seen: Set<string>,
  rated: Set<string>
): Promise<EndlessQueueItem[]> {
  const endlessSettings = getEndlessSettings(settings);
  const discoverTypes = discoverTypesForSettings(settings);
  const state = loadDiscoverState(groupId, memberId, settings);
  const queue = [...seedQueue];
  const knownIds = new Set(queue.map((item) => item.title_id));
  for (const titleId of seen) knownIds.add(titleId);
  for (const titleId of rated) knownIds.add(titleId);

  let pagesFetchedThisRefill = 0;
  let resultsReturned = 0;
  let resultsKeptAfterFilters = 0;
  let roundRobinIndex = 0;

  while (
    queue.length < TARGET_SIZE &&
    pagesFetchedThisRefill < MAX_PAGES_PER_REFILL &&
    discoverTypes.some((type) => !state.exhaustedByType[type])
  ) {
    const activeTypes = discoverTypes.filter((type) => !state.exhaustedByType[type]);
    const nextType = activeTypes[roundRobinIndex % activeTypes.length];
    roundRobinIndex += 1;
    const page = state.nextPageByType[nextType];

    const fetched = await fetchDiscoverPage(nextType, page, {
      minVoteCount: endlessSettings.filterUnpopular ? endlessSettings.minVoteCount ?? 200 : null,
      excludedGenreIds: endlessSettings.excludedGenreIds,
      releaseFrom: endlessSettings.releaseFrom,
      releaseTo: endlessSettings.releaseTo,
    });

    pagesFetchedThisRefill += 1;
    if (!fetched.ok) {
      break;
    }

    resultsReturned += fetched.rows.length;
    state.nextPageByType[nextType] = page + 1;
    if (fetched.noMore) {
      state.exhaustedByType[nextType] = true;
    }

    const filteredRows = await filterDiscoverRows(fetched.rows, settings);
    resultsKeptAfterFilters += filteredRows.length;

    for (const item of filteredRows) {
      if (queue.length >= TARGET_SIZE) break;
      if (knownIds.has(item.title_id)) continue;
      queue.push(item);
      knownIds.add(item.title_id);
    }
  }

  saveDiscoverState(groupId, memberId, state);

  if (process.env.NODE_ENV === "development") {
    console.debug("[endless] refill summary", {
      pagesFetched: pagesFetchedThisRefill,
      resultsReturned,
      resultsKeptAfterFilters,
      queueSizeAfterRefill: queue.length,
      lowWatermark: LOW_WATERMARK,
      targetSize: TARGET_SIZE,
      maxPagesPerRefill: MAX_PAGES_PER_REFILL,
      exhaustedByType: state.exhaustedByType,
    });
  }

  if (resultsReturned === 0 && process.env.NODE_ENV === "development") {
    const key = JSON.stringify({
      mediaType: endlessSettings.mediaType,
      minVoteCount: endlessSettings.filterUnpopular ? endlessSettings.minVoteCount ?? 200 : null,
      releaseFrom: endlessSettings.releaseFrom,
      releaseTo: endlessSettings.releaseTo,
      excludedGenreIds: endlessSettings.excludedGenreIds,
      exhaustedByType: state.exhaustedByType,
    });
    if (!noDiscoverResultsHintShownForGroup.has(key)) {
      noDiscoverResultsHintShownForGroup.add(key);
      console.debug(
        "[endless] discover returned no results; try lowering minVoteCount or widening release range",
        {
          mediaType: endlessSettings.mediaType,
          minVoteCount: endlessSettings.filterUnpopular ? endlessSettings.minVoteCount ?? 200 : null,
          releaseFrom: endlessSettings.releaseFrom,
          releaseTo: endlessSettings.releaseTo,
          excludedGenreIdsCount: endlessSettings.excludedGenreIds.length,
          exhaustedByType: state.exhaustedByType,
        }
      );
    }
  }

  return queue;
}

export function getUpcomingQueue(groupId: string, memberId: string) {
  return loadUpcoming(groupId, memberId);
}

export async function ensureEndlessQueue(
  groupId: string,
  memberId: string,
  settings: GroupSettings
): Promise<EndlessQueueItem[]> {
  const persisted = loadGroup(groupId);
  const effectiveSettings = persisted
    ? persisted.settings
    : normalizeGroupSettings(settings);

  const seen = new Set(loadSeen(groupId, memberId));
  const ratedLocal = localRatedTitleKeys(groupId, memberId);
  const ratedRemote = await remoteRatedTitleKeys(groupId, memberId);
  const rated = new Set([...ratedLocal, ...ratedRemote]);

  const dedupedUpcoming = loadUpcoming(groupId, memberId).filter((item) => {
    return !seen.has(item.title_id) && !rated.has(item.title_id);
  });

  if (dedupedUpcoming.length >= LOW_WATERMARK) {
    saveUpcoming(groupId, memberId, dedupedUpcoming);
    return dedupedUpcoming;
  }

  const next = await refillUpcomingQueue(
    groupId,
    memberId,
    effectiveSettings,
    dedupedUpcoming,
    seen,
    rated
  );

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
