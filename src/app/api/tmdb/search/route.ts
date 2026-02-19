import { NextRequest } from "next/server";
import {
  errorJson,
  MissingTmdbTokenError,
  okJson,
  parseEnum,
  parsePositiveInt,
  parseRequiredString,
  tmdbFetch,
  validateLanguage,
} from "@/app/api/tmdb/_shared";
import { buildTmdbTitleKey } from "@/lib/tmdbTitleKey";

type SearchType = "multi" | "movie" | "tv";
type TmdbMediaType = "movie" | "tv";

type TmdbSearchItem = {
  id: number;
  media_type?: string;
  title?: string | null;
  name?: string | null;
  release_date?: string | null;
  first_air_date?: string | null;
  poster_path?: string | null;
  overview?: string | null;
  vote_average?: number | null;
};

type TmdbSearchResponse = {
  page: number;
  total_pages: number;
  total_results: number;
  results: TmdbSearchItem[];
};

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const q = parseRequiredString(searchParams.get("q"), "q");
  if (!q.ok) return q.response;

  const type = parseEnum(searchParams.get("type"), ["multi", "movie", "tv"] as const, "type", "multi");
  if (!type.ok) return type.response;

  const page = parsePositiveInt(searchParams.get("page"), "page", {
    defaultValue: 1,
    min: 1,
    max: 500,
  });
  if (!page.ok) return page.response;

  const language = validateLanguage(searchParams.get("language"));
  if (!language.ok) return language.response;

  const path = type.value === "multi" ? "/search/multi" : `/search/${type.value}`;
  let upstream: Awaited<ReturnType<typeof tmdbFetch<TmdbSearchResponse>>>;
  try {
    upstream = await tmdbFetch<TmdbSearchResponse>(path, {
      callSite: "search.GET",
      query: {
        query: q.value,
        page: page.value,
        include_adult: "false",
        language: language.value,
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
    const mediaType = (type.value === "multi" ? item.media_type : type.value) as string | undefined;
    const normalizedMediaType: TmdbMediaType | null =
      mediaType === "movie" || mediaType === "tv" ? mediaType : null;

    return {
      id: item.id,
      media_type: mediaType as SearchType | string | undefined,
      title_key: normalizedMediaType ? buildTmdbTitleKey(normalizedMediaType, item.id) : null,
      title: item.title ?? null,
      name: item.name ?? null,
      release_date: item.release_date ?? null,
      first_air_date: item.first_air_date ?? null,
      poster_path: item.poster_path ?? null,
      overview: item.overview ?? "",
      vote_average: typeof item.vote_average === "number" ? item.vote_average : null,
    };
  });

  return okJson({
    page: upstream.data.page,
    total_pages: upstream.data.total_pages,
    total_results: upstream.data.total_results,
    results,
  });
}
