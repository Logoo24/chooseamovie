export type ContentType = "movies" | "movies_and_shows";
export type RatingMode = "unlimited" | "shortlist";
export type EndlessMediaType = "movie" | "movies_and_tv" | "tv";

export type EndlessSettings = {
  filterUnpopular: boolean;
  minVoteCount: number | null;
  mediaType: EndlessMediaType;
  excludedGenreIds: number[];
  releaseFrom: string | null;
  releaseTo: string | null;
};

type LegacyEndlessSettingsInput = Partial<EndlessSettings> & {
  genres?: number[] | null;
};

type GroupSettingsInput = Partial<Omit<GroupSettings, "endless">> & {
  allow_members_invite?: boolean;
  endless?: LegacyEndlessSettingsInput | null;
};

const DEFAULT_ENDLESS_SETTINGS: EndlessSettings = {
  filterUnpopular: true,
  minVoteCount: 200,
  mediaType: "movie",
  excludedGenreIds: [],
  releaseFrom: null,
  releaseTo: null,
};

const DEFAULT_TOP_TITLES_LIMIT = 100;
const MIN_TOP_TITLES_LIMIT = 1;
const MAX_TOP_TITLES_LIMIT = 100;

export type GroupSettings = {
  contentType: ContentType;
  allowG: boolean;
  allowPG: boolean;
  allowPG13: boolean;
  allowR: boolean;
  allow_members_invite_link: boolean;
  top_titles_limit: number;

  ratingMode: RatingMode;       // new
  shortlistItems: string[];     // new (only used if ratingMode === "shortlist")
  endless: EndlessSettings;
};

export type Group = {
  id: string;
  name: string;
  createdAt: string;
  schemaVersion: 1;
  joinCode?: string;
  ownerUserId?: string;
  settings: GroupSettings;
};

const KEY_PREFIX = "chooseamovie:group:";
const KEY_GROUP_INDEX = "chooseamovie:group:index";

export function createGroupId() {
  return crypto.randomUUID();
}

export function saveGroup(group: Group) {
  localStorage.setItem(KEY_PREFIX + group.id, JSON.stringify(group));
  const raw = localStorage.getItem(KEY_GROUP_INDEX);
  const ids = raw ? (JSON.parse(raw) as string[]) : [];
  if (!ids.includes(group.id)) {
    localStorage.setItem(KEY_GROUP_INDEX, JSON.stringify([group.id, ...ids]));
  }
}

export function loadGroup(groupId: string): Group | null {
  const raw = localStorage.getItem(KEY_PREFIX + groupId);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Omit<Group, "schemaVersion"> & {
      schemaVersion?: number;
    };

    return {
      ...parsed,
      settings: normalizeGroupSettings(parsed.settings),
      schemaVersion: 1,
    };
  } catch {
    return null;
  }
}

function normalizeDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function normalizeTopTitlesLimit(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_TOP_TITLES_LIMIT;
  const normalized = Math.floor(raw);
  if (normalized < MIN_TOP_TITLES_LIMIT) return MIN_TOP_TITLES_LIMIT;
  if (normalized > MAX_TOP_TITLES_LIMIT) return MAX_TOP_TITLES_LIMIT;
  return normalized;
}

export function getEndlessSettings(
  groupSettings: { endless?: LegacyEndlessSettingsInput | null } | undefined
): EndlessSettings {
  const endless = groupSettings?.endless ?? null;
  const filterUnpopular = endless?.filterUnpopular ?? DEFAULT_ENDLESS_SETTINGS.filterUnpopular;
  const normalizedMinVoteCount =
    typeof endless?.minVoteCount === "number" &&
      Number.isFinite(endless.minVoteCount) &&
      endless.minVoteCount >= 0
      ? Math.floor(endless.minVoteCount)
      : DEFAULT_ENDLESS_SETTINGS.minVoteCount;
  const minVoteCount = filterUnpopular ? normalizedMinVoteCount : null;

  const mediaType =
    endless?.mediaType === "movies_and_tv"
      ? "movies_and_tv"
      : endless?.mediaType === "tv"
        ? "tv"
        : DEFAULT_ENDLESS_SETTINGS.mediaType;

  const excludedGenreIds = Array.isArray(endless?.excludedGenreIds)
    ? endless.excludedGenreIds
    : Array.isArray(endless?.genres)
      ? endless.genres
      : DEFAULT_ENDLESS_SETTINGS.excludedGenreIds;

  return {
    filterUnpopular,
    minVoteCount,
    mediaType,
    excludedGenreIds: excludedGenreIds.filter((id): id is number => Number.isInteger(id) && id > 0),
    releaseFrom: normalizeDate(endless?.releaseFrom),
    releaseTo: normalizeDate(endless?.releaseTo),
  };
}

export function normalizeGroupSettings(settings: GroupSettingsInput | undefined): GroupSettings {
  const legacyAllowMembersInvite =
    settings && "allow_members_invite" in settings
      ? Boolean(settings.allow_members_invite)
      : undefined;

  return {
    contentType: settings?.contentType === "movies_and_shows" ? "movies_and_shows" : "movies",
    allowG: settings?.allowG ?? true,
    allowPG: settings?.allowPG ?? true,
    allowPG13: settings?.allowPG13 ?? true,
    allowR: settings?.allowR ?? true,
    allow_members_invite_link: settings?.allow_members_invite_link ?? legacyAllowMembersInvite ?? false,
    top_titles_limit: normalizeTopTitlesLimit(settings?.top_titles_limit),
    ratingMode: settings?.ratingMode === "shortlist" ? "shortlist" : "unlimited",
    shortlistItems: Array.isArray(settings?.shortlistItems) ? settings!.shortlistItems : [],
    endless: getEndlessSettings(settings),
  };
}

export function listSavedGroups(): Group[] {
  const raw = localStorage.getItem(KEY_GROUP_INDEX);
  if (!raw) return [];

  try {
    const ids = JSON.parse(raw) as string[];
    const groups = ids.map((id) => loadGroup(id)).filter(Boolean) as Group[];
    groups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return groups;
  } catch {
    return [];
  }
}

export function removeSavedGroup(groupId: string) {
  localStorage.removeItem(KEY_PREFIX + groupId);

  const raw = localStorage.getItem(KEY_GROUP_INDEX);
  if (!raw) return;

  try {
    const ids = JSON.parse(raw) as string[];
    const next = ids.filter((id) => id !== groupId);
    localStorage.setItem(KEY_GROUP_INDEX, JSON.stringify(next));
  } catch {
    // ignore malformed index
  }
}
