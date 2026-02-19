import { aggregateGroupRatings, type AggregatedRow } from "@/lib/ratings";
import { getTopTitles, type DbError } from "@/lib/api";
import { isSupabaseConfigured } from "@/lib/supabase";

const LOCAL_TOP_TITLES_KEY = (groupId: string) => `chooseamovie:group_top_titles:${groupId}`;

export type GroupTopTitle = {
  titleId: string;
  avg: number;
  votes: number;
  rank: number | null;
};

function isForbiddenError(error: DbError | null | undefined) {
  if (!error) return false;
  const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("permission denied") || text.includes("row-level security");
}

function fromAggregate(rows: AggregatedRow[]): GroupTopTitle[] {
  return rows.map((row, index) => ({
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

function normalizeRows(
  data: Array<{
    title_id: string;
    avg_rating: number | string;
    rating_count: number;
  }>
): GroupTopTitle[] {
  const rows: GroupTopTitle[] = [];
  for (const [index, row] of data.entries()) {
    const titleId = String(row.title_id ?? "").trim();
    if (!titleId) continue;
    const avg = Number(row.avg_rating ?? 0);
    const votes = Number(row.rating_count ?? 0);
    rows.push({
      titleId,
      avg: Number.isFinite(avg) ? avg : 0,
      votes: Number.isFinite(votes) ? votes : 0,
      rank: index + 1,
    });
  }

  rows.sort((a, b) => {
    if (a.rank !== null && b.rank !== null && a.rank !== b.rank) return a.rank - b.rank;
    if (b.avg !== a.avg) return b.avg - a.avg;
    if (b.votes !== a.votes) return b.votes - a.votes;
    return a.titleId.localeCompare(b.titleId);
  });

  return rows;
}

export async function getGroupTopTitles(groupId: string): Promise<{
  rows: GroupTopTitle[];
  error: "none" | "network";
  accessDenied?: boolean;
}> {
  if (!isSupabaseConfigured()) {
    return { rows: fromAggregate(aggregateGroupRatings(groupId).rows), error: "none", accessDenied: false };
  }

  let fetched = await getTopTitles(groupId);
  if (fetched.error) {
    const accessDenied = isForbiddenError(fetched.error);
    if (accessDenied) {
      return { rows: [], error: "none", accessDenied: true };
    }
    const local = loadLocalTopTitles(groupId);
    return { rows: local, error: "network", accessDenied: false };
  }

  let rows = normalizeRows(
    (fetched.data ?? []).map((row) => ({
      title_id: row.title_id,
      avg_rating: row.avg_rating,
      rating_count: row.rating_count,
    }))
  );

  saveLocalTopTitles(groupId, rows);
  return { rows, error: "none", accessDenied: false };
}
