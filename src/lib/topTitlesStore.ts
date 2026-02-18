import { aggregateGroupRatings, type AggregatedRow } from "@/lib/ratings";
import { ensureAnonymousSession, supabase } from "@/lib/supabase";

const GROUP_TOP_TITLES_TABLE = "group_top_titles";
const LOCAL_TOP_TITLES_KEY = (groupId: string) => `chooseamovie:group_top_titles:${groupId}`;
const RECOMPUTE_ATTEMPT_KEY = (groupId: string) => `chooseamovie:group_top_titles:recompute:${groupId}`;
const RECOMPUTE_GUARD_MS = 30000;

export type GroupTopTitle = {
  titleId: string;
  avg: number;
  votes: number;
  rank: number | null;
};

function shouldAttemptRecompute(groupId: string) {
  if (typeof window === "undefined") return true;
  const raw = localStorage.getItem(RECOMPUTE_ATTEMPT_KEY(groupId));
  if (!raw) return true;
  const last = Number(raw);
  if (!Number.isFinite(last)) return true;
  return Date.now() - last > RECOMPUTE_GUARD_MS;
}

function markRecomputeAttempt(groupId: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(RECOMPUTE_ATTEMPT_KEY(groupId), String(Date.now()));
}

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toOptionalNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function fromAggregate(rows: AggregatedRow[]): GroupTopTitle[] {
  return rows.slice(0, 10).map((row, index) => ({
    titleId: row.titleId,
    avg: row.avg,
    votes: row.votes,
    rank: index + 1,
  }));
}

function loadLocalTopTitles(groupId: string): GroupTopTitle[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(LOCAL_TOP_TITLES_KEY(groupId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as GroupTopTitle[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function saveLocalTopTitles(groupId: string, rows: GroupTopTitle[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(LOCAL_TOP_TITLES_KEY(groupId), JSON.stringify(rows));
}

function normalizeRows(data: Array<Record<string, unknown>>): GroupTopTitle[] {
  const rows = data
    .map((row) => {
      const titleId = String(row.title_id ?? "").trim();
      if (!titleId) return null;
      const avg = toNumber(row.avg ?? row.avg_rating ?? row.average);
      const votes = toNumber(
        row.votes ?? row.rating_count ?? row.count ?? row.ratings_count ?? row.num_ratings
      );
      const rank = toOptionalNumber(row.rank ?? row.position);
      return { titleId, avg, votes, rank };
    })
    .filter((row): row is GroupTopTitle => row !== null);

  rows.sort((a, b) => {
    const ar = a.rank ?? Number.MAX_SAFE_INTEGER;
    const br = b.rank ?? Number.MAX_SAFE_INTEGER;
    if (ar !== br) return ar - br;
    if (b.avg !== a.avg) return b.avg - a.avg;
    if (b.votes !== a.votes) return b.votes - a.votes;
    return a.titleId.localeCompare(b.titleId);
  });

  return rows.slice(0, 10);
}

export async function getGroupTopTitles(groupId: string): Promise<{
  rows: GroupTopTitle[];
  error: "none" | "network";
  accessDenied?: boolean;
}> {
  if (!supabase) {
    return { rows: fromAggregate(aggregateGroupRatings(groupId).rows), error: "none", accessDenied: false };
  }
  const client = supabase;

  await ensureAnonymousSession();
  try {
    const fetchRows = async () =>
      client
        .from(GROUP_TOP_TITLES_TABLE)
        .select("*")
        .eq("group_id", groupId)
        .order("avg_rating", { ascending: false })
        .order("rating_count", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(10);

    let { data, error } = await fetchRows();

    if (error) {
      const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
      const accessDenied = text.includes("permission denied") || text.includes("row-level security");
      if (accessDenied) {
        return { rows: [], error: "none", accessDenied: true };
      }
      const local = loadLocalTopTitles(groupId);
      return { rows: local, error: "network", accessDenied: false };
    }

    let rows = normalizeRows((data ?? []) as Array<Record<string, unknown>>);

    if (rows.length === 0 && shouldAttemptRecompute(groupId)) {
      markRecomputeAttempt(groupId);
      const recompute = await client.rpc("recompute_group_top_titles", { p_group_id: groupId });
      if (!recompute.error) {
        const retried = await fetchRows();
        data = retried.data;
        error = retried.error;
        if (error) {
          const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
          const accessDenied = text.includes("permission denied") || text.includes("row-level security");
          if (accessDenied) {
            return { rows: [], error: "none", accessDenied: true };
          }
          const local = loadLocalTopTitles(groupId);
          return { rows: local, error: "network", accessDenied: false };
        }
        rows = normalizeRows((data ?? []) as Array<Record<string, unknown>>);
      }
    }

    saveLocalTopTitles(groupId, rows);
    return { rows, error: "none", accessDenied: false };
  } catch {
    const local = loadLocalTopTitles(groupId);
    return { rows: local, error: "network", accessDenied: false };
  }
}
