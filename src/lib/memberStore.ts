import {
  ensureAuth,
  getAuthUserId,
  getMemberForCurrentUserInGroup,
  joinGroup,
  listMembers as listMembersDb,
  removeMember,
  type DbError,
} from "@/lib/api";
import { ensureMemberByName, getActiveMember, listMembers, upsertMember, type Member } from "@/lib/ratings";
import { isSupabaseConfigured } from "@/lib/supabase";

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

function isForbiddenError(error: DbError | null | undefined) {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return (
    text.includes("permission denied") ||
    text.includes("row-level security") ||
    text.includes("forbidden") ||
    text.includes("cannot_remove_host")
  );
}

function isNotFoundError(error: DbError | null | undefined) {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("member_not_found") || text.includes("not found");
}

function isInvalidJoinCodeError(error: DbError | null | undefined) {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("invalid_join_code") || text.includes("join_code") || text.includes("invalid");
}

function isAuthRequiredError(error: DbError | null | undefined) {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message ?? ""}`.toLowerCase();
  return text.includes("auth_required");
}

function toMember(row: { id: string; name: string; created_at?: string | null }): Member {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

function logJoinAttempt(details: {
  groupId: string;
  userId: string | null;
  outcome: "success" | "error";
  code?: string | null;
  message?: string | null;
}) {
  if (process.env.NODE_ENV !== "development") return;
  console.info("[joinGroup]", details);
}

export async function joinGroupMember(
  groupId: string,
  name: string
): Promise<{
  member: Member | null;
  error: "none" | "invalid_code" | "auth_failed" | "network" | "unknown";
}> {
  const trimmed = name.trim();
  if (!isSupabaseConfigured()) {
    logJoinAttempt({ groupId, userId: null, outcome: "success" });
    return { member: ensureMemberByName(groupId, trimmed), error: "none" };
  }

  const userId = await ensureAuth();
  if (!userId) {
    logJoinAttempt({
      groupId,
      userId: null,
      outcome: "error",
      code: "auth_required",
      message: "Could not establish auth session before join_group.",
    });
    return { member: null, error: "auth_failed" };
  }

  const joined = await joinGroup(groupId, groupId, trimmed);
  if (joined.error) {
    logJoinAttempt({
      groupId,
      userId,
      outcome: "error",
      code: joined.error.code,
      message: joined.error.message,
    });

    if (isAuthRequiredError(joined.error)) {
      return { member: null, error: "auth_failed" };
    }
    if (isInvalidJoinCodeError(joined.error)) {
      return { member: null, error: "invalid_code" };
    }
    if (isNetworkLikeError(joined.error)) {
      return { member: null, error: "network" };
    }
    return { member: null, error: "unknown" };
  }

  if (!joined.data) return { member: null, error: "unknown" };

  const member = toMember(joined.data);
  upsertMember(groupId, member);
  logJoinAttempt({ groupId, userId, outcome: "success" });
  return { member, error: "none" };
}

export async function getCurrentGroupMember(groupId: string): Promise<{
  member: Member | null;
  error: "none" | "auth_failed" | "network";
}> {
  if (!isSupabaseConfigured()) {
    return { member: getActiveMember(groupId), error: "none" };
  }

  const userId = await getAuthUserId();
  if (!userId) {
    return { member: null, error: "auth_failed" };
  }

  const mine = await getMemberForCurrentUserInGroup(groupId);
  if (mine.error) {
    if (isAuthRequiredError(mine.error)) {
      return { member: null, error: "auth_failed" };
    }
    return { member: null, error: "network" };
  }

  if (!mine.data) {
    return { member: null, error: "none" };
  }

  const member = toMember(mine.data);
  upsertMember(groupId, member);
  return { member, error: "none" };
}

export async function ensureMember(groupId: string, name: string): Promise<Member> {
  const trimmed = name.trim();
  if (!isSupabaseConfigured()) return ensureMemberByName(groupId, trimmed);

  const mine = await getMemberForCurrentUserInGroup(groupId);
  if (mine.data) {
    const member = toMember(mine.data);
    upsertMember(groupId, member);
    return member;
  }

  const listed = await listMembersDb(groupId);
  if (listed.data) {
    const byName = listed.data.find((row) => row.name.toLowerCase() === trimmed.toLowerCase());
    if (byName) {
      const member = toMember(byName);
      upsertMember(groupId, member);
      return member;
    }
  }

  return ensureMemberByName(groupId, trimmed);
}

export async function listGroupMembers(groupId: string): Promise<{
  members: Member[];
  error: "none" | "network" | "forbidden";
}> {
  if (!isSupabaseConfigured()) {
    return { members: listMembers(groupId), error: "none" };
  }

  const listed = await listMembersDb(groupId);
  if (listed.error) {
    return {
      members: listMembers(groupId),
      error: isForbiddenError(listed.error) ? "forbidden" : "network",
    };
  }

  const members = (listed.data ?? []).map((row) => toMember(row));
  for (const member of members) {
    upsertMember(groupId, member);
  }
  return { members, error: "none" };
}

export async function removeGroupMember(groupId: string, memberId: string): Promise<{
  error: "none" | "network" | "forbidden";
}> {
  if (!isSupabaseConfigured()) {
    const local = listMembers(groupId).filter((member) => member.id !== memberId);
    localStorage.setItem(`chooseamovie:members:${groupId}`, JSON.stringify(local));
    localStorage.removeItem(`chooseamovie:ratings:${groupId}:${memberId}`);
    return { error: "none" };
  }

  const removed = await removeMember(groupId, memberId);
  if (removed.error) {
    if (isNotFoundError(removed.error)) {
      return { error: "none" };
    }
    return { error: isForbiddenError(removed.error) ? "forbidden" : "network" };
  }

  const local = listMembers(groupId).filter((member) => member.id !== memberId);
  localStorage.setItem(`chooseamovie:members:${groupId}`, JSON.stringify(local));
  localStorage.removeItem(`chooseamovie:ratings:${groupId}:${memberId}`);
  return { error: "none" };
}
