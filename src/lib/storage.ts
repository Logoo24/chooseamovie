export type ContentType = "movies" | "movies_and_shows";

export type GroupSettings = {
  contentType: ContentType;
  allowG: boolean;
  allowPG: boolean;
  allowPG13: boolean;
  allowR: boolean;
};

export type Group = {
  id: string;
  name: string;
  createdAt: string;
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
    return JSON.parse(raw) as Group;
  } catch {
    return null;
  }
}
