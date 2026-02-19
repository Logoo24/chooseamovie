import { getCustomList, setCustomList } from "@/lib/api";
import { isSupabaseConfigured } from "@/lib/supabase";

const LOCAL_SHORTLIST_KEY = (groupId: string) => `chooseamovie:shortlist:${groupId}`;

export type ShortlistMediaType = "movie" | "tv";

export type ShortlistSnapshot = {
  title: string;
  year: string | null;
  poster_path: string | null;
  media_type: ShortlistMediaType;
};

export type ShortlistItem = {
  group_id: string;
  title_id: string;
  title_snapshot: ShortlistSnapshot;
  position: number;
};

function loadLocalShortlist(groupId: string): ShortlistItem[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(LOCAL_SHORTLIST_KEY(groupId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<
      ShortlistItem & { title_key?: string; title_snapshot?: ShortlistSnapshot }
    >;
    return parsed
      .map((item) => ({
        ...item,
        title_id: item.title_id ?? item.title_key ?? "",
        title_snapshot: item.title_snapshot,
      }))
      .filter((item) => item.title_id && item.title_snapshot)
      .sort((a, b) => a.position - b.position);
  } catch {
    return [];
  }
}

function saveLocalShortlist(groupId: string, items: ShortlistItem[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_SHORTLIST_KEY(groupId), JSON.stringify(normalize(items)));
}

function normalize(items: ShortlistItem[]) {
  return [...items]
    .sort((a, b) => a.position - b.position)
    .map((item, index) => ({ ...item, position: index + 1 }));
}

function upsertLocalItem(groupId: string, item: ShortlistItem) {
  const local = loadLocalShortlist(groupId);
  const idx = local.findIndex((x) => x.title_id === item.title_id);
  if (idx >= 0) {
    local[idx] = item;
  } else {
    local.push(item);
  }
  saveLocalShortlist(groupId, local);
}

async function syncCustomList(groupId: string, localItems: ShortlistItem[]) {
  if (!isSupabaseConfigured()) return;

  const payload = normalize(localItems).map((item) => ({
    title_id: item.title_id,
    title_snapshot: item.title_snapshot as unknown as Record<string, unknown>,
    position: item.position,
  }));

  await setCustomList(groupId, payload);
}

export async function getShortlist(groupId: string): Promise<ShortlistItem[]> {
  if (!isSupabaseConfigured()) return loadLocalShortlist(groupId);

  const remote = await getCustomList(groupId);
  if (remote.error) {
    return loadLocalShortlist(groupId);
  }

  const rows: ShortlistItem[] = (remote.data ?? []).map((row) => ({
    group_id: row.group_id,
    title_id: row.title_id,
    title_snapshot: row.title_snapshot as unknown as ShortlistSnapshot,
    position: Number(row.position ?? 0) || 0,
  }));

  const normalized = normalize(rows);
  saveLocalShortlist(groupId, normalized);
  return normalized;
}

export async function addToShortlist(
  groupId: string,
  titleKey: string,
  snapshot: ShortlistSnapshot
): Promise<void> {
  upsertLocalItem(groupId, {
    group_id: groupId,
    title_id: titleKey,
    title_snapshot: snapshot,
    position: loadLocalShortlist(groupId).length + 1,
  });

  const local = loadLocalShortlist(groupId);
  const existing = local.find((x) => x.title_id === titleKey);
  if (existing) {
    existing.title_snapshot = snapshot;
    saveLocalShortlist(groupId, normalize(local));
  } else {
    local.push({
      group_id: groupId,
      title_id: titleKey,
      title_snapshot: snapshot,
      position: local.length + 1,
    });
    saveLocalShortlist(groupId, normalize(local));
  }

  await syncCustomList(groupId, loadLocalShortlist(groupId));
}

export async function removeFromShortlist(groupId: string, titleKey: string): Promise<void> {
  const next = normalize(loadLocalShortlist(groupId).filter((x) => x.title_id !== titleKey));
  saveLocalShortlist(groupId, next);
  await syncCustomList(groupId, next);
}

export async function reorderShortlist(groupId: string, titleKeys: string[]): Promise<void> {
  const byKey = new Map(loadLocalShortlist(groupId).map((item) => [item.title_id, item]));
  const localNext: ShortlistItem[] = [];
  for (const key of titleKeys) {
    const item = byKey.get(key);
    if (item) localNext.push(item);
  }
  const normalized = normalize(localNext);
  saveLocalShortlist(groupId, normalized);
  await syncCustomList(groupId, normalized);
}

export async function replaceShortlist(
  groupId: string,
  items: Array<{ titleKey: string; snapshot: ShortlistSnapshot }>
): Promise<void> {
  const next: ShortlistItem[] = items.map((item, index) => ({
    group_id: groupId,
    title_id: item.titleKey,
    title_snapshot: item.snapshot,
    position: index + 1,
  }));

  saveLocalShortlist(groupId, next);
  await syncCustomList(groupId, next);
}

export function clearLocalShortlist(groupId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LOCAL_SHORTLIST_KEY(groupId));
}
