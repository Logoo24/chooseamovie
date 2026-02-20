import { NextRequest } from "next/server";
import {
  errorJson,
  MissingTmdbTokenError,
  okJson,
  tmdbFetch,
  validateLanguage,
} from "@/app/api/tmdb/_shared";

type SeedType = "movie" | "tv";

type LandingSeed = {
  displayTitle: string;
  query: string;
  type: SeedType;
  year: number;
};

type TmdbSearchItem = {
  id?: number;
  title?: string | null;
  name?: string | null;
  release_date?: string | null;
  first_air_date?: string | null;
  vote_average?: number | null;
  poster_path?: string | null;
};

type TmdbSearchResponse = {
  results?: TmdbSearchItem[];
};

const LANDING_SEEDS: LandingSeed[] = [
  { displayTitle: "The Truman Show", query: "The Truman Show", type: "movie", year: 1998 },
  { displayTitle: "Baby Driver", query: "Baby Driver", type: "movie", year: 2017 },
  { displayTitle: "Avengers", query: "The Avengers", type: "movie", year: 2012 },
  { displayTitle: "Avengers: Endgame", query: "Avengers Endgame", type: "movie", year: 2019 },
  { displayTitle: "Bridgerton", query: "Bridgerton", type: "tv", year: 2020 },
  { displayTitle: "Jurassic Park", query: "Jurassic Park", type: "movie", year: 1993 },
  { displayTitle: "High School Musical", query: "High School Musical", type: "movie", year: 2006 },
];

function buildPosterUrl(posterPath: string | null | undefined) {
  if (!posterPath) return null;
  return `https://image.tmdb.org/t/p/w342${posterPath}`;
}

function pickTopResult(results: TmdbSearchItem[] | undefined): TmdbSearchItem | null {
  if (!Array.isArray(results) || results.length === 0) return null;
  const withPoster = results.find((item) => Boolean(item.poster_path));
  return withPoster ?? results[0] ?? null;
}

export async function GET(request: NextRequest) {
  const language = validateLanguage(request.nextUrl.searchParams.get("language"));
  if (!language.ok) return language.response;

  try {
    const titles = await Promise.all(
      LANDING_SEEDS.map(async (seed) => {
        let upstream: Awaited<ReturnType<typeof tmdbFetch<TmdbSearchResponse>>>;
        try {
          upstream = await tmdbFetch<TmdbSearchResponse>(`/search/${seed.type}`, {
            callSite: "landing-samples.GET",
            query: {
              query: seed.query,
              page: 1,
              include_adult: "false",
              language: language.value ?? "en-US",
              ...(seed.type === "movie"
                ? { year: seed.year }
                : { first_air_date_year: seed.year }),
            },
          });
        } catch (error) {
          if (error instanceof MissingTmdbTokenError) throw error;
          return {
            id: null,
            media_type: seed.type,
            display_title: seed.displayTitle,
            title: seed.displayTitle,
            year: String(seed.year),
            vote_average: null,
            poster_url: null,
          };
        }

        if (!upstream.ok) {
          return {
            id: null,
            media_type: seed.type,
            display_title: seed.displayTitle,
            title: seed.displayTitle,
            year: String(seed.year),
            vote_average: null,
            poster_url: null,
          };
        }

        const item = pickTopResult(upstream.data.results);
        const releaseDate = seed.type === "movie" ? item?.release_date : item?.first_air_date;
        const year = releaseDate ? releaseDate.slice(0, 4) : String(seed.year);

        return {
          id: typeof item?.id === "number" ? item.id : null,
          media_type: seed.type,
          display_title: seed.displayTitle,
          title: seed.type === "movie" ? item?.title ?? seed.displayTitle : item?.name ?? seed.displayTitle,
          year,
          vote_average: typeof item?.vote_average === "number" ? item.vote_average : null,
          poster_url: buildPosterUrl(item?.poster_path),
        };
      })
    );

    return okJson(
      { titles },
      "public, s-maxage=3600, stale-while-revalidate=86400"
    );
  } catch (error) {
    if (error instanceof MissingTmdbTokenError) {
      return errorJson(500, "config_error", error.message);
    }
    throw error;
  }
}
