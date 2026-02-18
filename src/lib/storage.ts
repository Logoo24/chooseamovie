export type ContentType = "movies" | "movies_and_shows";
export type RatingMode = "unlimited" | "shortlist";

export type GroupSettings = {
  contentType: ContentType;
  allowG: boolean;
  allowPG: boolean;
  allowPG13: boolean;
  allowR: boolean;

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

export function createGroupId() {
  return crypto.randomUUID();
}

export function saveGroup(group: Group) {
  localStorage.setItem(KEY_PREFIX + group.id, JSON.stringify(group));
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
      schemaVersion: 1,
    };
  } catch {
    return null;
  }
}
