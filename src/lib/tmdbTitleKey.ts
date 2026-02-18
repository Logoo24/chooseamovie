export type TmdbTitleType = "movie" | "tv";

export type ParsedTmdbTitleKey = {
  provider: "tmdb";
  type: TmdbTitleType;
  id: number;
};

export function buildTmdbTitleKey(type: TmdbTitleType, id: number | string) {
  const parsedId = typeof id === "string" ? Number(id) : id;
  if (!Number.isInteger(parsedId) || parsedId <= 0) return "";
  return `tmdb:${type}:${parsedId}`;
}

export function parseTmdbTitleKey(titleKey: string): ParsedTmdbTitleKey | null {
  const raw = titleKey.trim();
  const match = /^tmdb:(movie|tv):(\d+)$/.exec(raw);
  if (!match) return null;

  const id = Number(match[2]);
  if (!Number.isInteger(id) || id <= 0) return null;

  return {
    provider: "tmdb",
    type: match[1] as TmdbTitleType,
    id,
  };
}

