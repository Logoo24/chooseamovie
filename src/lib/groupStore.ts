import { supabase } from "@/lib/supabase";
import { ensureAnonymousSession, getCurrentUserId } from "@/lib/supabase";
import { loadGroup, saveGroup, type Group, type GroupSettings } from "@/lib/storage";

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
  error: "none" | "not_found" | "invalid_code" | "auth_failed";
};

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

    if (error || !data) {
      if (error && status === 400) {
        markGroupsSchemaMismatch(error);
      }
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
      settings: data.settings as GroupSettings,
    };

    groupsSchemaMismatch = false;
    saveGroup(group);
    return { group, error: "none" };
  } catch {
    const local = loadGroup(groupId);
    return { group: local, error: local ? "none" : "not_found" };
  }
}
