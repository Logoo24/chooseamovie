import { aggregateGroupRatings, type AggregatedRow } from "@/lib/ratings";
import { getTopTitles, type DbError } from "@/lib/api";
import { isSupabaseConfigured } from "@/lib/supabase";

const LOCAL_TOP_TITLES_KEY = (groupId: string) => `chooseamovie:group_top_titles:${groupId}`;

export type GroupTopTitle = {
  titleId: string;
  totalStars: number;
  avg: number;
  votes: number;
  rank: number | null;
};

function isForbiddenError(error: DbError | null | undefined) {
  if (!error) return false;
  const text = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  return text.includes("permission denied") || text.includes("row-level security");
}

function orderRows(rows: GroupTopTitle[]) {
  const sorted = [...rows].sort((a, b) => {
    if (b.totalStars !== a.totalStars) return b.totalStars - a.totalStars;
    if (b.avg !== a.avg) return b.avg - a.avg;
    if (b.votes !== a.votes) return b.votes - a.votes;
    return a.titleId.localeCompare(b.titleId);
  });

  return sorted.map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
}

function fromAggregate(rows: AggregatedRow[]): GroupTopTitle[] {
  return orderRows(rows.map((row) => ({
    titleId: row.titleId,
    totalStars: row.totalStars,
    avg: row.avg,
    votes: row.votes,
    rank: null,
  })));
}

function loadLocalTopTitles(groupId: string): GroupTopTitle[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(LOCAL_TOP_TITLES_KEY(groupId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as Array<{
      titleId?: unknown;
      totalStars?: unknown;
      avg?: unknown;
      votes?: unknown;
    }>;
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed
      .map((row) => {
        const titleId = String(row.titleId ?? "").trim();
        if (!titleId) return null;
        const avg = Number(row.avg ?? 0);
        const votes = Number(row.votes ?? 0);
        const totalStarsRaw = Number(row.totalStars);
        const totalStars = Number.isFinite(totalStarsRaw)
          ? totalStarsRaw
          : Math.round((Number.isFinite(avg) ? avg : 0) * (Number.isFinite(votes) ? votes : 0));
        return {
          titleId,
          totalStars: Number.isFinite(totalStars) ? totalStars : 0,
          avg: Number.isFinite(avg) ? avg : 0,
          votes: Number.isFinite(votes) ? votes : 0,
          rank: null,
        } satisfies GroupTopTitle;
      })
      .filter((row): row is GroupTopTitle => row !== null);

    return orderRows(normalized);
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
    total_stars?: number;
    avg_rating: number | string;
    rating_count: number;
  }>
): GroupTopTitle[] {
  const rows: GroupTopTitle[] = [];
  for (const row of data) {
    const titleId = String(row.title_id ?? "").trim();
    if (!titleId) continue;
    const avg = Number(row.avg_rating ?? 0);
    const votes = Number(row.rating_count ?? 0);
    const totalStarsRaw = Number(row.total_stars);
    const totalStars = Number.isFinite(totalStarsRaw)
      ? totalStarsRaw
      : Math.round((Number.isFinite(avg) ? avg : 0) * (Number.isFinite(votes) ? votes : 0));
    rows.push({
      titleId,
      totalStars: Number.isFinite(totalStars) ? totalStars : 0,
      avg: Number.isFinite(avg) ? avg : 0,
      votes: Number.isFinite(votes) ? votes : 0,
      rank: null,
    });
  }

  return orderRows(rows);
}

export async function getGroupTopTitles(groupId: string): Promise<{
  rows: GroupTopTitle[];
  error: "none" | "network";
  accessDenied?: boolean;
}> {
  if (!isSupabaseConfigured()) {
    return { rows: fromAggregate(aggregateGroupRatings(groupId).rows), error: "none", accessDenied: false };
  }

  const fetched = await getTopTitles(groupId);
  if (fetched.error) {
    const accessDenied = isForbiddenError(fetched.error);
    if (accessDenied) {
      return { rows: [], error: "none", accessDenied: true };
    }
    const local = loadLocalTopTitles(groupId);
    return { rows: local, error: "network", accessDenied: false };
  }

  const rows = normalizeRows(
    (fetched.data ?? []).map((row) => ({
      title_id: row.title_id,
      total_stars: row.total_stars,
      avg_rating: row.avg_rating,
      rating_count: row.rating_count,
    }))
  );

  saveLocalTopTitles(groupId, rows);
  return { rows, error: "none", accessDenied: false };
}
