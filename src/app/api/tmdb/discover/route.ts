import { NextRequest } from "next/server";
import {
  errorJson,
  MissingTmdbTokenError,
  okJson,
  parseEnum,
  parsePositiveInt,
  tmdbFetch,
  validateLanguage,
} from "@/app/api/tmdb/_shared";
import { buildTmdbTitleKey } from "@/lib/tmdbTitleKey";

type DiscoverType = "movie" | "tv";

type TmdbDiscoverItem = {
  id: number;
  title?: string | null;
  name?: string | null;
  release_date?: string | null;
  first_air_date?: string | null;
  poster_path?: string | null;
  overview?: string | null;
  vote_count?: number | null;
};

type TmdbDiscoverResponse = {
  page: number;
  total_pages: number;
  total_results: number;
  results: TmdbDiscoverItem[];
};

function parseOptionalDate(
  raw: string | null,
  field: "releaseFrom" | "releaseTo"
): { ok: true; value?: string } | { ok: false; response: ReturnType<typeof errorJson> } {
  const trimmed = raw?.trim();
  if (!trimmed) return { ok: true, value: undefined };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return {
      ok: false,
      response: errorJson(400, "bad_request", `Invalid ${field}. Use YYYY-MM-DD format.`),
    };
  }
  return { ok: true, value: trimmed };
}

function parseOptionalGenreIds(
  raw: string | null,
  field: "genres" | "excludedGenreIds"
): { ok: true; value?: string } | { ok: false; response: ReturnType<typeof errorJson> } {
  const trimmed = raw?.trim();
  if (!trimmed) return { ok: true, value: undefined };
  const parts = trimmed
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return { ok: true, value: undefined };
  const ids: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n <= 0) {
      return {
        ok: false,
        response: errorJson(
          400,
          "bad_request",
          `Invalid ${field}. Use comma-separated numeric genre IDs.`
        ),
      };
    }
    ids.push(n);
  }
  return { ok: true, value: ids.join(",") };
}

function parseOptionalMinVoteCount(
  raw: string | null
): { ok: true; value?: number } | { ok: false; response: ReturnType<typeof errorJson> } {
  const trimmed = raw?.trim();
  if (!trimmed) return { ok: true, value: undefined };
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n < 0) {
    return {
      ok: false,
      response: errorJson(400, "bad_request", "Invalid minVoteCount. Must be a non-negative integer."),
    };
  }
  return { ok: true, value: n };
}

function extractYear(raw?: string | null) {
  if (!raw) return null;
  const match = /^(\d{4})/.exec(raw.trim());
  return match ? match[1] : null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const type = parseEnum(searchParams.get("type"), ["movie", "tv"] as const, "type");
  if (!type.ok) return type.response;

  const page = parsePositiveInt(searchParams.get("page"), "page", {
    defaultValue: 1,
    min: 1,
    max: 500,
  });
  if (!page.ok) return page.response;

  const language = validateLanguage(searchParams.get("language"));
  if (!language.ok) return language.response;

  const minVoteCount = parseOptionalMinVoteCount(searchParams.get("minVoteCount"));
  if (!minVoteCount.ok) return minVoteCount.response;

  const genres = parseOptionalGenreIds(searchParams.get("genres"), "genres");
  if (!genres.ok) return genres.response;
  const excludedGenreIds = parseOptionalGenreIds(
    searchParams.get("excludedGenreIds"),
    "excludedGenreIds"
  );
  if (!excludedGenreIds.ok) return excludedGenreIds.response;

  const releaseFrom = parseOptionalDate(searchParams.get("releaseFrom"), "releaseFrom");
  if (!releaseFrom.ok) return releaseFrom.response;

  const releaseTo = parseOptionalDate(searchParams.get("releaseTo"), "releaseTo");
  if (!releaseTo.ok) return releaseTo.response;

  const endpoint = type.value === "movie" ? "/discover/movie" : "/discover/tv";
  const releaseFromKey = type.value === "movie" ? "primary_release_date.gte" : "first_air_date.gte";
  const releaseToKey = type.value === "movie" ? "primary_release_date.lte" : "first_air_date.lte";

  let upstream: Awaited<ReturnType<typeof tmdbFetch<TmdbDiscoverResponse>>>;
  try {
    upstream = await tmdbFetch<TmdbDiscoverResponse>(endpoint, {
      callSite: "discover.GET",
      query: {
        page: page.value,
        language: language.value,
        sort_by: "popularity.desc",
        "vote_count.gte": minVoteCount.value,
        with_genres: genres.value,
        without_genres: excludedGenreIds.value,
        [releaseFromKey]: releaseFrom.value,
        [releaseToKey]: releaseTo.value,
      },
    });
  } catch (error) {
    if (error instanceof MissingTmdbTokenError) {
      return errorJson(500, "config_error", error.message);
    }
    throw error;
  }
  if (!upstream.ok) return upstream.response;

  const results = (upstream.data.results ?? []).map((item) => {
    const title = type.value === "movie" ? item.title : item.name;
    const releaseDate = type.value === "movie" ? item.release_date : item.first_air_date;
    return {
      id: item.id,
      type: type.value,
      title_key: buildTmdbTitleKey(type.value, item.id),
      title: title ?? "",
      year: extractYear(releaseDate),
      release_date: releaseDate ?? null,
      vote_count: typeof item.vote_count === "number" ? item.vote_count : null,
      poster_path: item.poster_path ?? null,
      overview: item.overview ?? "",
    };
  });

  return okJson({
    page: upstream.data.page,
    total_pages: upstream.data.total_pages,
    total_results: upstream.data.total_results,
    results,
  });
}
