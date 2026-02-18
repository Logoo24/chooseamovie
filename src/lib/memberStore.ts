import { supabase } from "@/lib/supabase";
import { ensureAnonymousSession } from "@/lib/supabase";
import {
  ensureMemberByName,
  upsertMember,
  type Member,
} from "@/lib/ratings";

const MEMBERS_TABLE = "members";

function toMember(row: { id: string; name: string; created_at?: string | null }): Member {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at ?? new Date().toISOString(),
  };
}

export async function joinGroupMember(
  groupId: string,
  name: string,
  joinCode: string
): Promise<{ member: Member | null; error: "none" | "invalid_code" | "auth_failed" | "unknown" }> {
  const trimmed = name.trim();
  if (!supabase) {
    return { member: ensureMemberByName(groupId, trimmed), error: "none" };
  }

  const uid = await ensureAnonymousSession();
  if (!uid) return { member: null, error: "auth_failed" };

  try {
    const { data, error } = await supabase.rpc("join_group", {
      p_group_id: groupId,
      p_name: trimmed,
      p_join_code: joinCode,
    });

    if (error) {
      const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
      if (text.includes("join_code") || text.includes("invalid")) {
        return { member: null, error: "invalid_code" };
      }
      return { member: null, error: "unknown" };
    }

    if (!data) return { member: null, error: "unknown" };

    const row = Array.isArray(data) ? data[0] : data;
    const member = toMember({
      id: row.id,
      name: row.name,
      created_at: row.created_at,
    });
    upsertMember(groupId, member);
    return { member, error: "none" };
  } catch {
    return { member: null, error: "unknown" };
  }
}

export async function ensureMember(groupId: string, name: string): Promise<Member> {
  const trimmed = name.trim();
  if (!supabase) return ensureMemberByName(groupId, trimmed);

  try {
    const { data: existing, error: existingError } = await supabase
      .from(MEMBERS_TABLE)
      .select("id, name, created_at")
      .eq("group_id", groupId)
      .ilike("name", trimmed)
      .limit(1)
      .maybeSingle();

    if (existingError) return ensureMemberByName(groupId, trimmed);

    if (existing) {
      const member = toMember(existing);
      upsertMember(groupId, member);
      return member;
    }

    const { data: inserted, error: insertError } = await supabase
      .from(MEMBERS_TABLE)
      .insert({
        id: crypto.randomUUID(),
        group_id: groupId,
        name: trimmed,
        created_at: new Date().toISOString(),
      })
      .select("id, name, created_at")
      .single();

    if (insertError || !inserted) return ensureMemberByName(groupId, trimmed);

    const member = toMember(inserted);
    upsertMember(groupId, member);
    return member;
  } catch {
    return ensureMemberByName(groupId, trimmed);
  }
}
