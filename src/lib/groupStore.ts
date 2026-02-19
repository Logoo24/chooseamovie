import {
  createGroup as createGroupDb,
  deleteGroup as deleteGroupDb,
  getGroup as getGroupDb,
  leaveGroup as leaveGroupDb,
  listGroupsForUser,
  updateGroupSettings as updateGroupSettingsDb,
  type DbError,
} from "@/lib/api";
import { getHostDisplayName } from "@/lib/hostProfileStore";
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
import { isSupabaseConfigured } from "@/lib/supabase";

let groupsSchemaMismatch = false;

function markGroupsSchemaMismatch(error: DbError) {
  groupsSchemaMismatch = true;
  console.error("Supabase groups schema mismatch (400)", {
    message: error.message,
    details: error.details,
    hint: error.hint,
    code: error.code,
  });
}

export function hasGroupsSchemaMismatch() {
  return groupsSchemaMismatch;
}

function makeJoinCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function isNetworkLikeError(error: DbError | null | undefined) {
  if (!error) return false;
  const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return (
    text.includes("network") ||
    text.includes("failed to fetch") ||
    text.includes("fetch failed") ||
    text.includes("timeout")
  );
}

function isForbiddenLikeError(error: DbError | null | undefined) {
  if (!error) return false;
  const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("permission denied") || text.includes("row-level security");
}

function isAuthRequiredError(error: DbError | null | undefined) {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return text.includes("auth_required");
}

function mapDbGroupToLocal(data: {
  id: string;
  name: string;
  created_at: string;
  join_code: string | null;
  owner_user_id: string | null;
  settings: Record<string, unknown>;
}): Group {
  return {
    id: data.id,
    name: data.name,
    createdAt: data.created_at,
    schemaVersion: 1,
    joinCode: data.join_code ?? undefined,
    ownerUserId: data.owner_user_id ?? undefined,
    settings: normalizeGroupSettings(data.settings as Partial<GroupSettings>),
  };
}

export type CreateGroupResult = {
  group: Group;
  authFailed: boolean;
};

export async function createGroup(group: Group): Promise<CreateGroupResult> {
  const enrichedGroup: Group = {
    ...group,
    settings: normalizeGroupSettings(group.settings),
    joinCode: group.joinCode ?? makeJoinCode(),
  };

  if (!isSupabaseConfigured()) {
    saveGroup(enrichedGroup);
    return { group: enrichedGroup, authFailed: false };
  }

  const hostName = getHostDisplayName().trim() || "Host";
  const remote = await createGroupDb(
    enrichedGroup.name,
    enrichedGroup.settings as unknown as Record<string, unknown>,
    enrichedGroup.schemaVersion,
    hostName
  );

  if (remote.error) {
    if (remote.status === 400) {
      markGroupsSchemaMismatch(remote.error);
    }
    saveGroup(enrichedGroup);
    return { group: enrichedGroup, authFailed: isAuthRequiredError(remote.error) };
  }

  if (!remote.data) {
    saveGroup(enrichedGroup);
    return { group: enrichedGroup, authFailed: false };
  }

  groupsSchemaMismatch = false;
  const resolved = mapDbGroupToLocal(remote.data);
  saveGroup(resolved);
  return { group: resolved, authFailed: false };
}

export type GetGroupResult = {
  group: Group | null;
  error: "none" | "not_found" | "invalid_code" | "auth_failed" | "network";
};

export async function getGroup(groupId: string, joinCode?: string): Promise<GetGroupResult> {
  if (!isSupabaseConfigured()) {
    const local = loadGroup(groupId);
    if (!local) return { group: null, error: "not_found" };
    if (joinCode && local.joinCode && local.joinCode !== joinCode) {
      return { group: null, error: "invalid_code" };
    }
    return { group: local, error: "none" };
  }

  const remote = await getGroupDb(groupId);

  if (remote.error) {
    if (remote.status === 400) {
      markGroupsSchemaMismatch(remote.error);
    }

    if (isAuthRequiredError(remote.error)) {
      return { group: null, error: "auth_failed" };
    }

    if (isNetworkLikeError(remote.error)) {
      const local = loadGroup(groupId);
      return { group: local, error: local ? "none" : "network" };
    }

    if (joinCode) return { group: null, error: "invalid_code" };
    const local = loadGroup(groupId);
    return { group: local, error: local ? "none" : "not_found" };
  }

  if (!remote.data) {
    if (joinCode) return { group: null, error: "invalid_code" };
    const local = loadGroup(groupId);
    return { group: local, error: local ? "none" : "not_found" };
  }

  const resolved = mapDbGroupToLocal(remote.data);
  if (joinCode && resolved.joinCode && resolved.joinCode !== joinCode) {
    return { group: null, error: "invalid_code" };
  }

  groupsSchemaMismatch = false;
  saveGroup(resolved);
  return { group: resolved, error: "none" };
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

  if (!isSupabaseConfigured()) {
    return { group: updated, error: "none" };
  }

  const remote = await updateGroupSettingsDb(groupId, settings as unknown as Record<string, unknown>);
  if (remote.error) {
    if (remote.status === 400) {
      markGroupsSchemaMismatch(remote.error);
    }
    if (isNetworkLikeError(remote.error)) return { group: updated, error: "network" };
  }

  return { group: updated, error: "none" };
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
  if (!isSupabaseConfigured()) return { hosted: [], joined: [], error: "none" };

  const remote = await listGroupsForUser();
  if (remote.error) {
    if (isAuthRequiredError(remote.error)) {
      return { hosted: [], joined: [], error: "auth_failed" };
    }

    if (isForbiddenLikeError(remote.error)) {
      return {
        hosted: remote.data?.hosted.map((row) => ({
          id: row.id,
          name: row.name,
          createdAt: row.created_at,
          ownerUserId: row.owner_user_id ?? undefined,
        })) ?? [],
        joined: [],
        error: "forbidden",
      };
    }

    return {
      hosted: remote.data?.hosted.map((row) => ({
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        ownerUserId: row.owner_user_id ?? undefined,
      })) ?? [],
      joined: [],
      error: "network",
    };
  }

  const hosted = (remote.data?.hosted ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    ownerUserId: row.owner_user_id ?? undefined,
  }));
  const joined = (remote.data?.joined ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    ownerUserId: row.owner_user_id ?? undefined,
  }));

  return { hosted, joined, error: "none" };
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
  if (!isSupabaseConfigured()) {
    cleanupLocalGroupState(groupId);
    return { error: "none" };
  }

  const remote = await deleteGroupDb(groupId);
  if (!remote.error) {
    cleanupLocalGroupState(groupId);
    return { error: "none" };
  }

  if (isForbiddenLikeError(remote.error)) {
    return { error: "forbidden" };
  }

  return { error: "network" };
}

export async function leaveGroup(groupId: string): Promise<{
  error: "none" | "forbidden" | "network" | "auth_failed";
}> {
  cleanupLocalGroupState(groupId);

  if (!isSupabaseConfigured()) return { error: "none" };

  const remote = await leaveGroupDb(groupId);
  if (!remote.error) return { error: "none" };
  if (isAuthRequiredError(remote.error)) return { error: "auth_failed" };
  if (isForbiddenLikeError(remote.error)) return { error: "forbidden" };
  return { error: "network" };
}
