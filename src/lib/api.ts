import type { PostgrestError } from "@supabase/supabase-js";
import {
  ensureAnonymousSession,
  getCurrentUserId,
  isSupabaseConfigured,
  supabase,
} from "@/lib/supabase";
import {
  isAuthRetryableError,
  logDbError,
  toDbError,
  toUnknownDbError,
  type DbError,
} from "@/lib/dbDebug";
import { getEndlessSettings, type EndlessSettings } from "@/lib/storage";

export type { DbError } from "@/lib/dbDebug";

type SupabaseResponse<T> = {
  data: T | null;
  error: PostgrestError | null;
  status?: number | null;
};

export type DbResult<T> = {
  data: T | null;
  error: DbError | null;
  status: number | null;
};

export type GroupRow = {
  id: string;
  name: string;
  created_at: string;
  schema_version: number;
  join_code: string | null;
  owner_user_id: string | null;
  settings: Record<string, unknown>;
};

export type GroupSummaryRow = Pick<GroupRow, "id" | "name" | "created_at" | "owner_user_id">;

export type MemberRow = {
  id: string;
  group_id: string;
  name: string;
  created_at: string;
  user_id: string | null;
  role: string;
};

export type RatingRow = {
  group_id: string;
  member_id: string;
  title_id: string;
  rating: number;
  updated_at: string;
};

export type GroupTopTitleRow = {
  group_id: string;
  title_id: string;
  avg_rating: number | string;
  rating_count: number;
  updated_at: string;
};

export type GroupCustomListRow = {
  group_id: string;
  title_id: string;
  title_snapshot: Record<string, unknown>;
  position: number;
  created_at: string;
};

export type TitleCacheRow = {
  title_id: string;
  snapshot: Record<string, unknown>;
  updated_at: string;
};

type DbCallContext = {
  operation: string;
  table?: string;
  rpc?: string;
  payload?: unknown;
};

const AUTH_REQUIRED_ERROR: DbError = {
  code: "auth_required",
  message: "Could not establish anonymous auth session",
  details: null,
  hint: null,
  status: null,
};

const NOT_CONFIGURED_ERROR: DbError = {
  code: "supabase_not_configured",
  message: "Supabase is not configured",
  details: null,
  hint: null,
  status: null,
};

const UUID_V4_OR_GENERIC_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_TOP_TITLES_LIMIT = 100;
const MAX_TOP_TITLES_LIMIT = 100;
const createGroupSanityWarningsShown = new Set<"rpc_error" | "null_result" | "non_uuid_result">();

function logCreateGroupSanityOnce(
  kind: "rpc_error" | "null_result" | "non_uuid_result",
  details: Record<string, unknown>
) {
  if (process.env.NODE_ENV !== "development") return;
  if (createGroupSanityWarningsShown.has(kind)) return;
  createGroupSanityWarningsShown.add(kind);
  console.warn("[db-sanity] create_group RPC issue", {
    kind,
    ...details,
  });
}

function normalizeStatus(status: number | null | undefined): number | null {
  return typeof status === "number" ? status : null;
}

async function runDbCall<T>(
  context: DbCallContext,
  fn: () => unknown
): Promise<DbResult<T>> {
  if (!supabase) {
    return { data: null, error: NOT_CONFIGURED_ERROR, status: null };
  }

  const userId = await ensureAuth();
  if (!userId) {
    logDbError(context, AUTH_REQUIRED_ERROR);
    return { data: null, error: AUTH_REQUIRED_ERROR, status: null };
  }

  const invoke = async () => {
    const response = (await fn()) as SupabaseResponse<T>;
    return {
      data: response.data,
      status: normalizeStatus(response.status),
      dbError: toDbError(response.error, normalizeStatus(response.status)),
    };
  };

  try {
    let first = await invoke();

    if (first.dbError && isAuthRetryableError(first.dbError)) {
      await ensureAnonymousSession();
      first = await invoke();
    }

    if (first.dbError) {
      logDbError(context, first.dbError);
      return { data: null, error: first.dbError, status: first.status };
    }

    return { data: first.data, error: null, status: first.status };
  } catch (error) {
    const dbError = toUnknownDbError(error);
    logDbError(context, dbError);
    return { data: null, error: dbError, status: null };
  }
}

export async function ensureAuth(): Promise<string | null> {
  const ensured = await ensureAnonymousSession();
  if (ensured) return ensured;
  return getCurrentUserId();
}

export async function getAuthUserId(): Promise<string | null> {
  return getCurrentUserId();
}

export async function checkSupabaseReachable(force = false): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  if (force) {
    await ensureAnonymousSession();
  }

  const result = await runDbCall<null>(
    { operation: "checkSupabaseReachable", table: "groups" },
    () =>
      supabase!
        .from("groups")
        .select("id", { head: true, count: "exact" })
        .limit(1)
  );
  return !result.error;
}

export async function createGroup(
  name: string,
  settings: Record<string, unknown>,
  schemaVersion: number,
  hostName: string
): Promise<DbResult<GroupRow>> {
  const rawEndless = (settings as { endless?: Partial<EndlessSettings> | null }).endless;
  const endless = getEndlessSettings({ endless: rawEndless });
  const rawTopTitlesLimit = (settings as { top_titles_limit?: unknown }).top_titles_limit;
  const topTitlesLimit =
    typeof rawTopTitlesLimit === "number" && Number.isFinite(rawTopTitlesLimit)
      ? Math.max(1, Math.min(MAX_TOP_TITLES_LIMIT, Math.floor(rawTopTitlesLimit)))
      : DEFAULT_TOP_TITLES_LIMIT;
  const payloadSettings = {
    ...settings,
    top_titles_limit: topTitlesLimit,
    endless: {
      filterUnpopular: endless.filterUnpopular,
      minVoteCount: endless.filterUnpopular ? endless.minVoteCount ?? 200 : null,
      mediaType: endless.mediaType,
      excludedGenreIds: endless.excludedGenreIds,
      releaseFrom: endless.releaseFrom,
      releaseTo: endless.releaseTo,
    },
    host_name: hostName,
  };

  const created = await runDbCall<string>(
    {
      operation: "createGroup",
      rpc: "create_group",
      payload: { p_name: name, p_schema_version: schemaVersion },
    },
    () =>
      supabase!.rpc("create_group", {
        p_name: name,
        p_settings: payloadSettings,
        p_schema_version: schemaVersion,
      })
  );

  if (created.error) {
    logCreateGroupSanityOnce("rpc_error", {
      code: created.error.code,
      status: created.error.status,
      message: created.error.message,
      details: created.error.details,
      hint: created.error.hint,
    });
    return { data: null, error: created.error, status: created.status };
  }

  if (!created.data) {
    logCreateGroupSanityOnce("null_result", {
      status: created.status,
      rpc: "create_group",
    });
    return {
      data: null,
      error: {
        code: "invalid_rpc_result",
        message: "create_group returned null",
        details: null,
        hint: "Expected a UUID string from create_group.",
        status: created.status,
      },
      status: created.status,
    };
  }

  if (!UUID_V4_OR_GENERIC_PATTERN.test(created.data)) {
    logCreateGroupSanityOnce("non_uuid_result", {
      status: created.status,
      rpc: "create_group",
      returned: created.data,
    });
    return {
      data: null,
      error: {
        code: "invalid_rpc_result",
        message: "create_group returned a non-UUID value",
        details: String(created.data),
        hint: "Expected a UUID string from create_group.",
        status: created.status,
      },
      status: created.status,
    };
  }

  return getGroup(created.data);
}

export async function getGroup(groupId: string): Promise<DbResult<GroupRow>> {
  return runDbCall<GroupRow>(
    { operation: "getGroup", table: "groups", payload: { groupId } },
    () =>
      supabase!
        .from("groups")
        .select("id, name, created_at, schema_version, join_code, owner_user_id, settings")
        .eq("id", groupId)
        .maybeSingle()
  );
}

export async function updateGroupSettings(
  groupId: string,
  settings: Record<string, unknown>
): Promise<DbResult<null>> {
  return runDbCall<null>(
    {
      operation: "updateGroupSettings",
      table: "groups",
      payload: { groupId },
    },
    () =>
      supabase!
        .from("groups")
        .update({ settings })
        .eq("id", groupId)
  );
}

export async function listGroupsForUser(): Promise<
  DbResult<{ hosted: GroupSummaryRow[]; joined: GroupSummaryRow[] }>
> {
  const userId = await ensureAuth();
  if (!userId) {
    logDbError({ operation: "listGroupsForUser", table: "groups" }, AUTH_REQUIRED_ERROR);
    return {
      data: { hosted: [], joined: [] },
      error: AUTH_REQUIRED_ERROR,
      status: null,
    };
  }

  const hostedRes = await runDbCall<GroupSummaryRow[]>(
    {
      operation: "listGroupsForUserHosted",
      table: "groups",
      payload: { userId },
    },
    () =>
      supabase!
        .from("groups")
        .select("id, name, created_at, owner_user_id")
        .eq("owner_user_id", userId)
        .order("created_at", { ascending: false })
  );
  if (hostedRes.error) {
    return {
      data: { hosted: [], joined: [] },
      error: hostedRes.error,
      status: hostedRes.status,
    };
  }

  const membershipRes = await runDbCall<Array<{ group_id: string }>>(
    {
      operation: "listGroupsForUserMemberships",
      table: "members",
      payload: { userId },
    },
    () =>
      supabase!
        .from("members")
        .select("group_id")
        .eq("user_id", userId)
  );
  if (membershipRes.error) {
    return {
      data: { hosted: hostedRes.data ?? [], joined: [] },
      error: membershipRes.error,
      status: membershipRes.status,
    };
  }

  const hosted = hostedRes.data ?? [];
  const hostedIds = new Set(hosted.map((row) => row.id));
  const joinedIds = Array.from(
    new Set((membershipRes.data ?? []).map((row) => row.group_id).filter((id) => !hostedIds.has(id)))
  );

  if (joinedIds.length === 0) {
    return { data: { hosted, joined: [] }, error: null, status: hostedRes.status };
  }

  const joinedRes = await runDbCall<GroupSummaryRow[]>(
    {
      operation: "listGroupsForUserJoined",
      table: "groups",
      payload: { joinedIds },
    },
    () =>
      supabase!
        .from("groups")
        .select("id, name, created_at, owner_user_id")
        .in("id", joinedIds)
        .order("created_at", { ascending: false })
  );

  if (joinedRes.error) {
    return {
      data: { hosted, joined: [] },
      error: joinedRes.error,
      status: joinedRes.status,
    };
  }

  return {
    data: { hosted, joined: joinedRes.data ?? [] },
    error: null,
    status: joinedRes.status,
  };
}

export async function listMembers(groupId: string): Promise<DbResult<MemberRow[]>> {
  return runDbCall<MemberRow[]>(
    {
      operation: "listMembers",
      table: "members",
      payload: { groupId },
    },
    () =>
      supabase!
        .from("members")
        .select("id, group_id, name, created_at, user_id, role")
        .eq("group_id", groupId)
        .order("created_at", { ascending: true })
  );
}

export async function getMemberForCurrentUserInGroup(groupId: string): Promise<DbResult<MemberRow>> {
  const userId = await ensureAuth();
  if (!userId) {
    logDbError({ operation: "getMemberForCurrentUserInGroup", table: "members" }, AUTH_REQUIRED_ERROR);
    return { data: null, error: AUTH_REQUIRED_ERROR, status: null };
  }

  return runDbCall<MemberRow>(
    {
      operation: "getMemberForCurrentUserInGroup",
      table: "members",
      payload: { groupId, userId },
    },
    () =>
      supabase!
        .from("members")
        .select("id, group_id, name, created_at, user_id, role")
        .eq("group_id", groupId)
        .eq("user_id", userId)
        .maybeSingle()
  );
}

export async function joinGroup(
  groupId: string,
  joinCode: string,
  name: string
): Promise<DbResult<MemberRow>> {
  const joined = await runDbCall<MemberRow | MemberRow[]>(
    {
      operation: "joinGroup",
      rpc: "join_group",
      payload: { groupId, joinCode, name },
    },
    () =>
      supabase!.rpc("join_group", {
        p_group_id: groupId,
        p_name: name,
        p_join_code: joinCode,
      })
  );

  if (joined.error || !joined.data) {
    return { data: null, error: joined.error, status: joined.status };
  }

  const member = Array.isArray(joined.data) ? joined.data[0] : joined.data;
  return { data: member ?? null, error: null, status: joined.status };
}

export async function removeMember(groupId: string, memberId: string): Promise<DbResult<null>> {
  return runDbCall<null>(
    {
      operation: "removeMember",
      table: "members",
      payload: { groupId, memberId },
    },
    () =>
      supabase!
        .from("members")
        .delete()
        .eq("group_id", groupId)
        .eq("id", memberId)
  );
}

export async function leaveGroup(groupId: string): Promise<DbResult<null>> {
  const userId = await ensureAuth();
  if (!userId) {
    logDbError({ operation: "leaveGroup", table: "members" }, AUTH_REQUIRED_ERROR);
    return { data: null, error: AUTH_REQUIRED_ERROR, status: null };
  }

  return runDbCall<null>(
    {
      operation: "leaveGroup",
      table: "members",
      payload: { groupId, userId },
    },
    () =>
      supabase!
        .from("members")
        .delete()
        .eq("group_id", groupId)
        .eq("user_id", userId)
  );
}

export async function deleteGroup(groupId: string): Promise<DbResult<null>> {
  return runDbCall<null>(
    {
      operation: "deleteGroup",
      rpc: "delete_group",
      payload: { groupId },
    },
    () =>
      supabase!.rpc("delete_group", {
        p_group_id: groupId,
      })
  );
}

export async function upsertRating(
  groupId: string,
  memberId: string,
  titleId: string,
  rating: number
): Promise<DbResult<null>> {
  return runDbCall<null>(
    {
      operation: "upsertRating",
      table: "ratings",
      payload: { groupId, memberId, titleId },
    },
    () =>
      supabase!.from("ratings").upsert(
        {
          group_id: groupId,
          member_id: memberId,
          title_id: titleId,
          rating,
        },
        { onConflict: "group_id,member_id,title_id" }
      )
  );
}

export async function listRatings(groupId: string): Promise<DbResult<RatingRow[]>> {
  return runDbCall<RatingRow[]>(
    {
      operation: "listRatings",
      table: "ratings",
      payload: { groupId },
    },
    () =>
      supabase!
        .from("ratings")
        .select("group_id, member_id, title_id, rating, updated_at")
        .eq("group_id", groupId)
  );
}

export async function listRatingsForMember(
  groupId: string,
  memberId: string
): Promise<DbResult<Array<Pick<RatingRow, "title_id">>>> {
  return runDbCall<Array<Pick<RatingRow, "title_id">>>(
    {
      operation: "listRatingsForMember",
      table: "ratings",
      payload: { groupId, memberId },
    },
    () =>
      supabase!
        .from("ratings")
        .select("title_id")
        .eq("group_id", groupId)
        .eq("member_id", memberId)
  );
}

export async function getTopTitles(groupId: string): Promise<DbResult<GroupTopTitleRow[]>> {
  return runDbCall<GroupTopTitleRow[]>(
    {
      operation: "getTopTitles",
      table: "group_top_titles",
      payload: { groupId },
    },
    () =>
      supabase!
        .from("group_top_titles")
        .select("group_id, title_id, avg_rating, rating_count, updated_at")
        .eq("group_id", groupId)
        .order("avg_rating", { ascending: false })
        .order("rating_count", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(MAX_TOP_TITLES_LIMIT)
  );
}

export async function recomputeGroupTopTitles(groupId: string): Promise<DbResult<null>> {
  return runDbCall<null>(
    {
      operation: "recomputeGroupTopTitles",
      rpc: "recompute_group_top_titles",
      payload: { groupId },
    },
    () =>
      supabase!.rpc("recompute_group_top_titles", {
        p_group_id: groupId,
      })
  );
}

export async function getCustomList(groupId: string): Promise<DbResult<GroupCustomListRow[]>> {
  return runDbCall<GroupCustomListRow[]>(
    {
      operation: "getCustomList",
      table: "group_custom_list",
      payload: { groupId },
    },
    () =>
      supabase!
        .from("group_custom_list")
        .select("group_id, title_id, title_snapshot, position, created_at")
        .eq("group_id", groupId)
        .order("position", { ascending: true })
  );
}

export async function setCustomList(
  groupId: string,
  items: Array<{
    title_id: string;
    title_snapshot: Record<string, unknown>;
    position: number;
  }>
): Promise<DbResult<GroupCustomListRow[]>> {
  const deleteRes = await runDbCall<null>(
    {
      operation: "setCustomListDelete",
      table: "group_custom_list",
      payload: { groupId },
    },
    () =>
      supabase!
        .from("group_custom_list")
        .delete()
        .eq("group_id", groupId)
  );

  if (deleteRes.error) {
    return { data: null, error: deleteRes.error, status: deleteRes.status };
  }

  if (items.length === 0) {
    return { data: [], error: null, status: deleteRes.status };
  }

  const upsertPayload = items.map((item) => ({
    group_id: groupId,
    title_id: item.title_id,
    title_snapshot: item.title_snapshot,
    position: item.position,
  }));

  const upsertRes = await runDbCall<null>(
    {
      operation: "setCustomListUpsert",
      table: "group_custom_list",
      payload: { groupId, count: upsertPayload.length },
    },
    () =>
      supabase!.from("group_custom_list").upsert(upsertPayload, {
        onConflict: "group_id,title_id",
      })
  );

  if (upsertRes.error) {
    return { data: null, error: upsertRes.error, status: upsertRes.status };
  }

  return getCustomList(groupId);
}

export async function getTitleCache(titleId: string): Promise<DbResult<TitleCacheRow>> {
  return runDbCall<TitleCacheRow>(
    {
      operation: "getTitleCache",
      table: "title_cache",
      payload: { titleId },
    },
    () =>
      supabase!
        .from("title_cache")
        .select("title_id, snapshot, updated_at")
        .eq("title_id", titleId)
        .maybeSingle()
  );
}

export async function getTitleCacheMany(titleIds: string[]): Promise<DbResult<TitleCacheRow[]>> {
  if (titleIds.length === 0) {
    return { data: [], error: null, status: 200 };
  }

  return runDbCall<TitleCacheRow[]>(
    {
      operation: "getTitleCacheMany",
      table: "title_cache",
      payload: { titleIds },
    },
    () =>
      supabase!
        .from("title_cache")
        .select("title_id, snapshot, updated_at")
        .in("title_id", titleIds)
  );
}

export async function upsertTitleCache(
  titleId: string,
  snapshot: Record<string, unknown>
): Promise<DbResult<null>> {
  return runDbCall<null>(
    {
      operation: "upsertTitleCache",
      table: "title_cache",
      payload: { titleId },
    },
    () =>
      supabase!.from("title_cache").upsert(
        {
          title_id: titleId,
          snapshot,
        },
        {
          onConflict: "title_id",
        }
      )
  );
}
