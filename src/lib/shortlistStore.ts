import { ensureAnonymousSession, supabase } from "@/lib/supabase";

const SHORTLIST_TABLE = "group_shortlist";
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

export async function getShortlist(groupId: string): Promise<ShortlistItem[]> {
  if (!supabase) return loadLocalShortlist(groupId);

  await ensureAnonymousSession();

  try {
    const primary = await supabase
      .from(SHORTLIST_TABLE)
      .select("group_id, title_id, title_snapshot, position")
      .eq("group_id", groupId)
      .order("position", { ascending: true });

    const fallback = primary.error
      ? await supabase
          .from(SHORTLIST_TABLE)
          .select("group_id, title_key, title_snapshot, position")
          .eq("group_id", groupId)
          .order("position", { ascending: true })
      : null;
    const data = !primary.error ? primary.data : fallback?.data;
    const error = !primary.error ? null : fallback?.error;
    if (error) return loadLocalShortlist(groupId);

    const rows: ShortlistItem[] = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      group_id: row.group_id as string,
      title_id: (row.title_id as string | null) ?? (row.title_key as string) ?? "",
      title_snapshot: row.title_snapshot as ShortlistSnapshot,
      position: Number(row.position ?? 0) || 0,
    }));

    const normalized = normalize(rows);
    saveLocalShortlist(groupId, normalized);
    return normalized;
  } catch {
    return loadLocalShortlist(groupId);
  }
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

  if (!supabase) {
    const local = loadLocalShortlist(groupId);
    const existing = local.find((x) => x.title_id === titleKey);
    if (existing) {
      existing.title_snapshot = snapshot;
      saveLocalShortlist(groupId, normalize(local));
      return;
    }
    local.push({
      group_id: groupId,
      title_id: titleKey,
      title_snapshot: snapshot,
      position: local.length + 1,
    });
    saveLocalShortlist(groupId, normalize(local));
    return;
  }

  await ensureAnonymousSession();

  try {
    const { data: existing } = await supabase
      .from(SHORTLIST_TABLE)
      .select("position")
      .eq("group_id", groupId)
      .eq("title_id", titleKey)
      .maybeSingle();

    let position = Number(existing?.position ?? 0) || 0;
    if (!position) {
      const { data: maxRow } = await supabase
        .from(SHORTLIST_TABLE)
        .select("position")
        .eq("group_id", groupId)
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      position = (Number(maxRow?.position ?? 0) || 0) + 1;
    }

    const { error } = await supabase.from(SHORTLIST_TABLE).upsert(
      {
        group_id: groupId,
        title_id: titleKey,
        title_snapshot: snapshot,
        position,
      },
      { onConflict: "group_id,title_id" }
    );

    if (error) {
      throw error;
    }
    upsertLocalItem(groupId, {
      group_id: groupId,
      title_id: titleKey,
      title_snapshot: snapshot,
      position,
    });
  } catch {
    const local = loadLocalShortlist(groupId);
    const existing = local.find((x) => x.title_id === titleKey);
    if (existing) {
      existing.title_snapshot = snapshot;
      saveLocalShortlist(groupId, normalize(local));
      return;
    }
    local.push({
      group_id: groupId,
      title_id: titleKey,
      title_snapshot: snapshot,
      position: local.length + 1,
    });
    saveLocalShortlist(groupId, normalize(local));
  }
}

export async function removeFromShortlist(groupId: string, titleKey: string): Promise<void> {
  saveLocalShortlist(
    groupId,
    loadLocalShortlist(groupId).filter((x) => x.title_id !== titleKey)
  );

  if (!supabase) {
    const next = loadLocalShortlist(groupId).filter((x) => x.title_id !== titleKey);
    saveLocalShortlist(groupId, normalize(next));
    return;
  }

  await ensureAnonymousSession();

  try {
    const { error } = await supabase
      .from(SHORTLIST_TABLE)
      .delete()
      .eq("group_id", groupId)
      .eq("title_id", titleKey);

    if (error) {
      throw error;
    }
  } catch {
    const next = loadLocalShortlist(groupId).filter((x) => x.title_id !== titleKey);
    saveLocalShortlist(groupId, normalize(next));
  }
}

export async function reorderShortlist(groupId: string, titleKeys: string[]): Promise<void> {
  const byKey = new Map(loadLocalShortlist(groupId).map((item) => [item.title_id, item]));
  const localNext: ShortlistItem[] = [];
  for (const key of titleKeys) {
    const item = byKey.get(key);
    if (item) localNext.push(item);
  }
  saveLocalShortlist(groupId, localNext);

  if (!supabase) {
    return;
  }

  await ensureAnonymousSession();
  const client = supabase;
  if (!client) return;

  try {
    await Promise.all(
      titleKeys.map((key, index) =>
        client
          .from(SHORTLIST_TABLE)
          .update({ position: index + 1 })
          .eq("group_id", groupId)
          .eq("title_id", key)
      )
    );
  } catch {
    saveLocalShortlist(groupId, localNext);
  }
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

  if (!supabase) return;

  await ensureAnonymousSession();
  const client = supabase;
  if (!client) return;

  try {
    await client.from(SHORTLIST_TABLE).delete().eq("group_id", groupId);
    if (next.length > 0) {
      const { error } = await client.from(SHORTLIST_TABLE).upsert(next, {
        onConflict: "group_id,title_id",
      });
      if (error) throw error;
    }
  } catch {
    // local draft remains available
  }
}

export function clearLocalShortlist(groupId: string) {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LOCAL_SHORTLIST_KEY(groupId));
}
