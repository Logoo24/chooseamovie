import { supabase } from "@/lib/supabase";
import {
  aggregateGroupRatings,
  loadRatings,
  saveRatings,
  type AggregatedRow,
  type Member,
  type MemberRatings,
  type RatingValue,
} from "@/lib/ratings";
import { upsertMember } from "@/lib/ratings";

const RATINGS_TABLE = "ratings";
const MEMBERS_TABLE = "members";

export type GroupRatingsResult = {
  members: Member[];
  perMember: Record<string, MemberRatings>;
  rows: AggregatedRow[];
  accessDenied?: boolean;
  error?: "none" | "network";
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

export async function setRating(
  groupId: string,
  memberId: string,
  titleId: string,
  value: RatingValue
): Promise<void> {
  // Keep local state responsive even when Supabase is slow/unavailable.
  const local = loadRatings(groupId, memberId);
  local[titleId] = value;
  saveRatings(groupId, memberId, local);

  if (!supabase) return;

  try {
    await supabase.from(RATINGS_TABLE).upsert(
      {
        group_id: groupId,
        member_id: memberId,
        title_id: titleId,
        value,
      },
      { onConflict: "group_id,member_id,title_id" }
    );
  } catch {
    // local fallback is already written
  }
}

function aggregateFromRecords(
  members: Member[],
  perMember: Record<string, MemberRatings>
): GroupRatingsResult {
  const totals: Record<string, { sum: number; votes: number; skips: number }> = {};

  for (const m of members) {
    const r = perMember[m.id] ?? {};
    for (const [titleId, val] of Object.entries(r)) {
      if (!totals[titleId]) totals[titleId] = { sum: 0, votes: 0, skips: 0 };
      if (val === 0) totals[titleId].skips += 1;
      else {
        totals[titleId].sum += val;
        totals[titleId].votes += 1;
      }
    }
  }

  const rows: AggregatedRow[] = Object.entries(totals).map(([titleId, t]) => ({
    titleId,
    avg: t.votes ? t.sum / t.votes : 0,
    votes: t.votes,
    skips: t.skips,
  }));

  rows.sort((a, b) => {
    if (b.avg !== a.avg) return b.avg - a.avg;
    if (b.votes !== a.votes) return b.votes - a.votes;
    return a.titleId.localeCompare(b.titleId);
  });

  return { members, perMember, rows, error: "none" };
}

export async function getGroupRatings(groupId: string): Promise<GroupRatingsResult> {
  if (!supabase) return { ...aggregateGroupRatings(groupId), error: "none" };

  try {
    const [membersRes, ratingsRes] = await Promise.all([
      supabase.from(MEMBERS_TABLE).select("id, name, created_at").eq("group_id", groupId),
      supabase.from(RATINGS_TABLE).select("member_id, title_id, value").eq("group_id", groupId),
    ]);

    if (membersRes.error || ratingsRes.error) {
      const hasRlsError = [membersRes.error, ratingsRes.error]
        .filter(Boolean)
        .some((e) => {
          const text = `${e?.message ?? ""} ${e?.details ?? ""}`.toLowerCase();
          return text.includes("permission denied") || text.includes("row-level security");
        });

      if (hasRlsError) {
        return { members: [], perMember: {}, rows: [], accessDenied: true, error: "none" };
      }

      const fallback = aggregateGroupRatings(groupId);
      const network = isNetworkLikeError(membersRes.error) || isNetworkLikeError(ratingsRes.error);
      return { ...fallback, error: network ? "network" : "none" };
    }

    const members: Member[] = (membersRes.data ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      createdAt: m.created_at ?? new Date().toISOString(),
    }));

    const perMember: Record<string, MemberRatings> = {};
    for (const m of members) {
      perMember[m.id] = {};
      upsertMember(groupId, m);
    }

    for (const r of ratingsRes.data ?? []) {
      if (!perMember[r.member_id]) perMember[r.member_id] = {};
      perMember[r.member_id][r.title_id] = r.value as RatingValue;
    }

    return { ...aggregateFromRecords(members, perMember), accessDenied: false, error: "none" };
  } catch {
    return { ...aggregateGroupRatings(groupId), error: "network" };
  }
}
