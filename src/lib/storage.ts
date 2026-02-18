export type ContentType = "movies" | "movies_and_shows";
export type RatingMode = "unlimited" | "shortlist";

export type GroupSettings = {
  contentType: ContentType;
  allowG: boolean;
  allowPG: boolean;
  allowPG13: boolean;
  allowR: boolean;
  allow_members_invite_link: boolean;

  ratingMode: RatingMode;       // new
  shortlistItems: string[];     // new (only used if ratingMode === "shortlist")
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

export function normalizeGroupSettings(settings: Partial<GroupSettings> | undefined): GroupSettings {
  const legacyAllowMembersInvite =
    settings && "allow_members_invite" in settings
      ? Boolean((settings as unknown as { allow_members_invite?: boolean }).allow_members_invite)
      : undefined;

  return {
    contentType: settings?.contentType === "movies_and_shows" ? "movies_and_shows" : "movies",
    allowG: settings?.allowG ?? true,
    allowPG: settings?.allowPG ?? true,
    allowPG13: settings?.allowPG13 ?? true,
    allowR: settings?.allowR ?? true,
    allow_members_invite_link: settings?.allow_members_invite_link ?? legacyAllowMembersInvite ?? false,
    ratingMode: settings?.ratingMode === "shortlist" ? "shortlist" : "unlimited",
    shortlistItems: Array.isArray(settings?.shortlistItems) ? settings!.shortlistItems : [],
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
