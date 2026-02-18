import { NextRequest } from "next/server";
import {
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
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const type = parseEnum(searchParams.get("type"), ["movie", "tv"] as const, "type");
  if (!type.ok) return type.response;

  const id = parsePositiveInt(searchParams.get("id"), "id", { min: 1, max: 999999999 });
  if (!id.ok) return id.response;

  const language = validateLanguage(searchParams.get("language"));
  if (!language.ok) return language.response;

  const upstream = await tmdbFetch<TmdbDetailsResponse>(`/${type.value}/${id.value}`, {
    language: language.value,
  });
  if (!upstream.ok) return upstream.response;

  const data = upstream.data;

  if (type.value === "movie") {
    return okJson({
      genres: (data.genres ?? []).map((genre) => ({ id: genre.id, name: genre.name })),
      runtime: data.runtime ?? null,
      original_language: data.original_language ?? null,
      popularity: data.popularity ?? null,
      vote_average: data.vote_average ?? null,
      overview: data.overview ?? "",
      poster_path: data.poster_path ?? null,
      backdrop_path: data.backdrop_path ?? null,
      release_date: data.release_date ?? null,
    });
  }

  return okJson({
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
