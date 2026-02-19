import { NextRequest } from "next/server";
import {
  errorJson,
  MissingTmdbTokenError,
  okJson,
  parseEnum,
  tmdbFetch,
} from "@/app/api/tmdb/_shared";
import { buildTmdbTitleKey } from "@/lib/tmdbTitleKey";

type TrendingType = "all" | "movie" | "tv";
type TrendingWindow = "day" | "week";
type ResultType = "movie" | "tv";

type TmdbTrendingItem = {
  id: number;
  media_type?: string;
  title?: string | null;
  name?: string | null;
  release_date?: string | null;
  first_air_date?: string | null;
  poster_path?: string | null;
  overview?: string | null;
  vote_count?: number | null;
};

type TmdbTrendingResponse = {
  results?: TmdbTrendingItem[];
};

function extractYear(date?: string | null) {
  if (!date) return null;
  const year = date.slice(0, 4);
  return /^\d{4}$/.test(year) ? year : null;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  const type = parseEnum(searchParams.get("type"), ["all", "movie", "tv"] as const, "type", "all");
  if (!type.ok) return type.response;

  const window = parseEnum(searchParams.get("window"), ["day", "week"] as const, "window", "week");
  if (!window.ok) return window.response;

  let upstream: Awaited<ReturnType<typeof tmdbFetch<TmdbTrendingResponse>>>;
  try {
    upstream = await tmdbFetch<TmdbTrendingResponse>(`/trending/${type.value}/${window.value}`, {
      callSite: "trending.GET",
    });
  } catch (error) {
    if (error instanceof MissingTmdbTokenError) {
      return errorJson(500, "config_error", error.message);
    }
    throw error;
  }
  if (!upstream.ok) return upstream.response;

  const results = (upstream.data.results ?? [])
    .filter((item) => {
      const itemType = type.value === "all" ? item.media_type : type.value;
      return itemType === "movie" || itemType === "tv";
    })
    .map((item) => {
      const itemType = (type.value === "all" ? item.media_type : type.value) as ResultType;
      const rawTitle = itemType === "movie" ? item.title : item.name;
      const rawDate = itemType === "movie" ? item.release_date : item.first_air_date;

      return {
        id: item.id,
        type: itemType,
        title_key: buildTmdbTitleKey(itemType, item.id),
        title: rawTitle ?? "",
        year: extractYear(rawDate),
        release_date: rawDate ?? null,
        vote_count: typeof item.vote_count === "number" ? item.vote_count : null,
        poster_path: item.poster_path ?? null,
        overview: item.overview ?? "",
      };
    });

  return okJson({ results });
}
