import { supabase } from "@/lib/supabase";
import { ensureAnonymousSession, getCurrentUserId } from "@/lib/supabase";
import { unmarkHostForGroup } from "@/lib/hostStore";
import { clearLocalGroupRatingsData } from "@/lib/ratings";
import { clearLocalShortlist } from "@/lib/shortlistStore";
import {
  loadGroup,
  normalizeGroupSettings,
  removeSavedGroup,
  saveGroup,
  type Group,
  type GroupSettings,
} from "@/lib/storage";

const GROUPS_TABLE = "groups";
const MEMBERS_TABLE = "members";
let groupsSchemaMismatch = false;

function markGroupsSchemaMismatch(error: {
  message?: string;
  details?: string;
  hint?: string;
}) {
  groupsSchemaMismatch = true;
  console.error("Supabase groups schema mismatch (400)", {
    message: error.message ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
  });
}

export function hasGroupsSchemaMismatch() {
  return groupsSchemaMismatch;
}

function makeJoinCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export type CreateGroupResult = {
  group: Group;
  authFailed: boolean;
};

export async function createGroup(group: Group): Promise<CreateGroupResult> {
  const uid = await ensureAnonymousSession();
  const enrichedGroup: Group = {
    ...group,
    settings: normalizeGroupSettings(group.settings),
    joinCode: group.joinCode ?? makeJoinCode(),
    ownerUserId: uid ?? group.ownerUserId,
  };

  if (!supabase) {
    saveGroup(enrichedGroup);
    return { group: enrichedGroup, authFailed: false };
  }

  try {
    const { error, status } = await supabase.from(GROUPS_TABLE).upsert(
      {
        id: enrichedGroup.id,
        name: enrichedGroup.name,
        created_at: enrichedGroup.createdAt,
        schema_version: enrichedGroup.schemaVersion,
        join_code: enrichedGroup.joinCode,
        owner_user_id: enrichedGroup.ownerUserId ?? null,
        settings: enrichedGroup.settings,
      },
      { onConflict: "id" }
    );

    if (error) {
      if (status === 400) {
        markGroupsSchemaMismatch(error);
      }
      saveGroup(enrichedGroup);
      return { group: enrichedGroup, authFailed: false };
    }

    if (uid) {
      await supabase.from(MEMBERS_TABLE).insert({
        id: crypto.randomUUID(),
        group_id: enrichedGroup.id,
        user_id: uid,
        name: "Host",
        role: "host",
        created_at: new Date().toISOString(),
      });
    }

    groupsSchemaMismatch = false;
    saveGroup(enrichedGroup);
    return { group: enrichedGroup, authFailed: false };
  } catch {
    saveGroup(enrichedGroup);
    return { group: enrichedGroup, authFailed: false };
  }
}

export type GetGroupResult = {
  group: Group | null;
  error: "none" | "not_found" | "invalid_code" | "auth_failed" | "network";
};

function isNetworkLikeError(error: { message?: string; details?: string } | null | undefined) {
  if (!error) return false;
  const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return (
    text.includes("network") ||
    text.includes("failed to fetch") ||
    text.includes("fetch failed") ||
    text.includes("timeout")
  );
}

export async function getGroup(groupId: string, joinCode?: string): Promise<GetGroupResult> {
  if (!supabase) {
    const local = loadGroup(groupId);
    if (!local) return { group: null, error: "not_found" };
    if (joinCode && local.joinCode && local.joinCode !== joinCode) {
      return { group: null, error: "invalid_code" };
    }
    return { group: local, error: "none" };
  }

  const userId = await getCurrentUserId();
  if (!userId) return { group: null, error: "auth_failed" };

  try {
    let query = supabase
      .from(GROUPS_TABLE)
      .select("id, name, created_at, schema_version, join_code, owner_user_id, settings")
      .eq("id", groupId);

    if (joinCode) {
      query = query.eq("join_code", joinCode);
    }

    const { data, error, status } = await query.maybeSingle();

    if (error) {
      if (error && status === 400) {
        markGroupsSchemaMismatch(error);
      }

      if (isNetworkLikeError(error)) {
        const local = loadGroup(groupId);
        return { group: local, error: local ? "none" : "network" };
      }

      if (joinCode) return { group: null, error: "invalid_code" };
      const local = loadGroup(groupId);
      return { group: local, error: local ? "none" : "not_found" };
    }

    if (!data) {
      if (joinCode) return { group: null, error: "invalid_code" };
      const local = loadGroup(groupId);
      return { group: local, error: local ? "none" : "not_found" };
    }

    const group: Group = {
      id: data.id,
      name: data.name,
      createdAt: data.created_at,
      schemaVersion: 1,
      joinCode: data.join_code ?? undefined,
      ownerUserId: data.owner_user_id ?? undefined,
      settings: normalizeGroupSettings(data.settings as GroupSettings),
    };

    groupsSchemaMismatch = false;
    saveGroup(group);
    return { group, error: "none" };
  } catch {
    const local = loadGroup(groupId);
    return { group: local, error: local ? "none" : "network" };
  }
}

export async function updateGroupSettings(groupId: string, settings: GroupSettings): Promise<{
  group: Group | null;
  error: "none" | "not_found" | "network";
}> {
  const local = loadGroup(groupId);
  if (!local) return { group: null, error: "not_found" };

  const updated: Group = {
    ...local,
    settings,
  };
  saveGroup(updated);

  if (!supabase) {
    return { group: updated, error: "none" };
  }

  await ensureAnonymousSession();

  try {
    const { error } = await supabase
      .from(GROUPS_TABLE)
      .update({ settings })
      .eq("id", groupId);

    if (error) {
      if (isNetworkLikeError(error)) return { group: updated, error: "network" };
      return { group: updated, error: "none" };
    }

    return { group: updated, error: "none" };
  } catch {
    return { group: updated, error: "network" };
  }
}

export type MyGroupSummary = {
  id: string;
  name: string;
  createdAt: string;
  ownerUserId?: string;
};

export async function getMyGroups(): Promise<{
  hosted: MyGroupSummary[];
  joined: MyGroupSummary[];
  error: "none" | "auth_failed" | "network" | "forbidden";
}> {
  if (!supabase) return { hosted: [], joined: [], error: "none" };

  const uid = await getCurrentUserId();
  if (!uid) return { hosted: [], joined: [], error: "auth_failed" };

  try {
    const hostedRes = await supabase
      .from(GROUPS_TABLE)
      .select("id, name, created_at, owner_user_id")
      .eq("owner_user_id", uid)
      .order("created_at", { ascending: false });

    if (hostedRes.error) {
      const text = `${hostedRes.error.message ?? ""} ${hostedRes.error.details ?? ""}`.toLowerCase();
      const forbidden = text.includes("permission denied") || text.includes("row-level security");
      return { hosted: [], joined: [], error: forbidden ? "forbidden" : "network" };
    }

    const hosted = (hostedRes.data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      createdAt: row.created_at as string,
      ownerUserId: (row.owner_user_id as string | null) ?? undefined,
    }));

    const memberRes = await supabase
      .from(MEMBERS_TABLE)
      .select("group_id")
      .eq("user_id", uid);

    if (memberRes.error) {
      const text = `${memberRes.error.message ?? ""} ${memberRes.error.details ?? ""}`.toLowerCase();
      const forbidden = text.includes("permission denied") || text.includes("row-level security");
      return { hosted, joined: [], error: forbidden ? "forbidden" : "network" };
    }

    const hostedIds = new Set(hosted.map((g) => g.id));
    const joinedIds = Array.from(
      new Set((memberRes.data ?? []).map((row) => row.group_id as string).filter((id) => !hostedIds.has(id)))
    );

    if (joinedIds.length === 0) return { hosted, joined: [], error: "none" };

    const joinedRes = await supabase
      .from(GROUPS_TABLE)
      .select("id, name, created_at, owner_user_id")
      .in("id", joinedIds)
      .order("created_at", { ascending: false });

    if (joinedRes.error) {
      const text = `${joinedRes.error.message ?? ""} ${joinedRes.error.details ?? ""}`.toLowerCase();
      const forbidden = text.includes("permission denied") || text.includes("row-level security");
      return { hosted, joined: [], error: forbidden ? "forbidden" : "network" };
    }

    const joined = (joinedRes.data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      createdAt: row.created_at as string,
      ownerUserId: (row.owner_user_id as string | null) ?? undefined,
    }));

    return { hosted, joined, error: "none" };
  } catch {
    return { hosted: [], joined: [], error: "network" };
  }
}

function cleanupLocalGroupState(groupId: string) {
  removeSavedGroup(groupId);
  unmarkHostForGroup(groupId);
  clearLocalGroupRatingsData(groupId);
  clearLocalShortlist(groupId);
}

export async function deleteGroup(groupId: string): Promise<{
  error: "none" | "forbidden" | "network";
}> {
  cleanupLocalGroupState(groupId);

  if (!supabase) return { error: "none" };

  await ensureAnonymousSession();

  try {
    const { error } = await supabase.from(GROUPS_TABLE).delete().eq("id", groupId);
    if (!error) return { error: "none" };

    const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
    if (text.includes("permission denied") || text.includes("row-level security")) {
      return { error: "forbidden" };
    }
    if (isNetworkLikeError(error)) {
      return { error: "network" };
    }
    return { error: "network" };
  } catch {
    return { error: "network" };
  }
}

export async function leaveGroup(groupId: string): Promise<{
  error: "none" | "forbidden" | "network" | "auth_failed";
}> {
  cleanupLocalGroupState(groupId);

  if (!supabase) return { error: "none" };

  const uid = await getCurrentUserId();
  if (!uid) return { error: "auth_failed" };

  try {
    const { error } = await supabase
      .from(MEMBERS_TABLE)
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", uid);

    if (!error) return { error: "none" };

    const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
    if (text.includes("permission denied") || text.includes("row-level security")) {
      return { error: "forbidden" };
    }
    if (isNetworkLikeError(error)) {
      return { error: "network" };
    }
    return { error: "network" };
  } catch {
    return { error: "network" };
  }
}
