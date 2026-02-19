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

type TitleType = "movie" | "tv";

type TmdbGenre = {
  id: number;
  name: string;
};

type TmdbDetailsResponse = {
  title?: string | null;
  name?: string | null;
  genres?: TmdbGenre[];
  runtime?: number | null;
  episode_run_time?: number[] | null;
  original_language?: string | null;
  popularity?: number | null;
  vote_average?: number | null;
  overview?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string | null;
  first_air_date?: string | null;
  release_dates?: {
    results?: Array<{
      iso_3166_1?: string | null;
      release_dates?: Array<{
        certification?: string | null;
      }>;
    }>;
  };
};

function normalizeMpaa(certification: string | null | undefined) {
  const raw = (certification ?? "").trim().toUpperCase();
  if (!raw) return null;
  if (raw === "PG13") return "PG-13";
  return raw;
}

function extractUsMovieMpaa(
  releaseDates: TmdbDetailsResponse["release_dates"]
): string | null {
  const regions = releaseDates?.results ?? [];
  const us = regions.find((region) => region.iso_3166_1 === "US");
  if (!us) return null;
  for (const entry of us.release_dates ?? []) {
    const normalized = normalizeMpaa(entry.certification);
    if (normalized) return normalized;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const type = parseEnum(searchParams.get("type"), ["movie", "tv"] as const, "type");
  if (!type.ok) return type.response;

  const id = parsePositiveInt(searchParams.get("id"), "id", { min: 1, max: 999999999 });
  if (!id.ok) return id.response;

  const language = validateLanguage(searchParams.get("language"));
  if (!language.ok) return language.response;

  let upstream: Awaited<ReturnType<typeof tmdbFetch<TmdbDetailsResponse>>>;
  try {
    upstream = await tmdbFetch<TmdbDetailsResponse>(`/${type.value}/${id.value}`, {
      callSite: "details.GET",
      query: {
        language: language.value,
        append_to_response: type.value === "movie" ? "release_dates" : undefined,
      },
    });
  } catch (error) {
    if (error instanceof MissingTmdbTokenError) {
      return errorJson(500, "config_error", error.message);
    }
    throw error;
  }
  if (!upstream.ok) return upstream.response;

  const data = upstream.data;

  if (type.value === "movie") {
    return okJson({
      title: data.title ?? null,
      genres: (data.genres ?? []).map((genre) => ({ id: genre.id, name: genre.name })),
      runtime: data.runtime ?? null,
      original_language: data.original_language ?? null,
      popularity: data.popularity ?? null,
      vote_average: data.vote_average ?? null,
      overview: data.overview ?? "",
      poster_path: data.poster_path ?? null,
      backdrop_path: data.backdrop_path ?? null,
      release_date: data.release_date ?? null,
      mpaa_rating: extractUsMovieMpaa(data.release_dates),
    });
  }

  return okJson({
    name: data.name ?? null,
    genres: (data.genres ?? []).map((genre) => ({ id: genre.id, name: genre.name })),
    episode_run_time: data.episode_run_time ?? [],
    original_language: data.original_language ?? null,
    popularity: data.popularity ?? null,
    vote_average: data.vote_average ?? null,
    overview: data.overview ?? "",
    poster_path: data.poster_path ?? null,
    backdrop_path: data.backdrop_path ?? null,
    first_air_date: data.first_air_date ?? null,
  });
}
