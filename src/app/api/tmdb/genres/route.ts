import { NextRequest } from "next/server";
import {
  errorJson,
  guardTmdbProxyRequest,
  MissingTmdbTokenError,
  okJson,
  parseEnum,
  tmdbFetch,
  validateLanguage,
} from "@/app/api/tmdb/_shared";

type GenreType = "movie" | "tv";

type TmdbGenre = {
  id: number;
  name: string;
};

type TmdbGenreListResponse = {
  genres?: TmdbGenre[];
};

function normalizeGenres(raw: TmdbGenre[] | undefined) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((genre) => Number.isInteger(genre.id) && typeof genre.name === "string")
    .map((genre) => ({
      id: genre.id,
      name: genre.name.trim(),
    }))
    .filter((genre) => genre.name.length > 0);
}

export async function GET(request: NextRequest) {
  const guard = await guardTmdbProxyRequest(request, "genres.GET");
  if (guard) return guard;

  const { searchParams } = request.nextUrl;

  const type = parseEnum(searchParams.get("type"), ["movie", "tv"] as const, "type");
  if (!type.ok) return type.response;

  const language = validateLanguage(searchParams.get("language"));
  if (!language.ok) return language.response;

  const query = { language: language.value };

  const fetchGenreList = async (mediaType: GenreType) =>
    tmdbFetch<TmdbGenreListResponse>(`/genre/${mediaType}/list`, {
      callSite: `genres.GET.${mediaType}`,
      query,
    });

  try {
    const upstream = await fetchGenreList(type.value);
    if (!upstream.ok) return upstream.response;

    const genres = normalizeGenres(upstream.data.genres).sort((a, b) => a.name.localeCompare(b.name));

    return okJson(
      {
        genres,
      },
      "public, s-maxage=86400, stale-while-revalidate=604800"
    );
  } catch (error) {
    if (error instanceof MissingTmdbTokenError) {
      return errorJson(500, "config_error", error.message);
    }
    throw error;
  }
}
