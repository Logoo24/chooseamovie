import { NextRequest } from "next/server";
import {
  errorJson,
  guardTmdbProxyRequest,
  MissingTmdbTokenError,
  okJson,
  parseEnum,
  parsePositiveInt,
  tmdbFetch,
} from "@/app/api/tmdb/_shared";

type TmdbProvider = {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
};

type TmdbProvidersResponse = {
  results?: {
    US?: {
      link?: string;
      flatrate?: TmdbProvider[];
      rent?: TmdbProvider[];
      buy?: TmdbProvider[];
    };
  };
};

function mapProvider(provider: TmdbProvider) {
  return {
    provider_id: provider.provider_id,
    provider_name: provider.provider_name,
    logo_path: provider.logo_path ?? null,
  };
}

export async function GET(request: NextRequest) {
  const guard = await guardTmdbProxyRequest(request, "providers.GET");
  if (guard) return guard;

  const { searchParams } = request.nextUrl;

  const type = parseEnum(searchParams.get("type"), ["movie", "tv"] as const, "type");
  if (!type.ok) return type.response;

  const id = parsePositiveInt(searchParams.get("id"), "id", { min: 1, max: 999999999 });
  if (!id.ok) return id.response;

  let upstream: Awaited<ReturnType<typeof tmdbFetch<TmdbProvidersResponse>>>;
  try {
    upstream = await tmdbFetch<TmdbProvidersResponse>(`/${type.value}/${id.value}/watch/providers`, {
      callSite: "providers.GET",
    });
  } catch (error) {
    if (error instanceof MissingTmdbTokenError) {
      return errorJson(500, "config_error", error.message);
    }
    throw error;
  }
  if (!upstream.ok) return upstream.response;

  const us = upstream.data.results?.US;
  const flatrate = (us?.flatrate ?? []).map(mapProvider);
  const rent = (us?.rent ?? []).map(mapProvider);
  const buy = (us?.buy ?? []).map(mapProvider);

  const seen = new Set<number>();
  const prioritized: Array<
    ReturnType<typeof mapProvider> & { access_type: "flatrate" | "rent" | "buy" }
  > = [];

  for (const [accessType, list] of [
    ["flatrate", flatrate],
    ["rent", rent],
    ["buy", buy],
  ] as const) {
    for (const provider of list) {
      if (seen.has(provider.provider_id)) continue;
      seen.add(provider.provider_id);
      prioritized.push({
        ...provider,
        access_type: accessType,
      });
    }
  }

  return okJson({
    tmdb_link: us?.link ?? `https://www.themoviedb.org/${type.value}/${id.value}/watch?locale=US`,
    us: {
      flatrate,
      rent,
      buy,
    },
    prioritized,
  });
}
