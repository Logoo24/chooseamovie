"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { StateCard } from "@/components/StateCard";
import { Button, Card, CardTitle, Muted, Pill } from "@/components/ui";
import { getGroupRatings, type GroupRatingsResult } from "@/lib/ratingStore";
import { getActiveMember } from "@/lib/ratings";
import { getShortlist, type ShortlistItem, type ShortlistSnapshot } from "@/lib/shortlistStore";
import { loadGroup, type Group } from "@/lib/storage";
import { getTitleSnapshots, type TitleSnapshot, upsertTitleSnapshot } from "@/lib/titleCacheStore";
import { parseTmdbTitleKey } from "@/lib/tmdbTitleKey";
import { TITLES, titleSearchUrl } from "@/lib/titles";
import { type AggregatedRow } from "@/lib/ratings";

function starsText(avg: number) {
  if (!avg) return "-";
  return avg.toFixed(2);
}

function starsVisual(avg: number) {
  const filled = Math.max(0, Math.min(5, Math.round(avg)));
  return `${"*".repeat(filled)}${".".repeat(5 - filled)}`;
}

function resolveShortlistSnapshotByTitleId(titleId: string, shortlist: ShortlistItem[]) {
  const direct = shortlist.find((item) => item.title_key === titleId);
  if (direct) return direct.title_snapshot;
  if (!titleId.startsWith("sl:")) return null;
  const parts = titleId.split(":");
  if (parts.length < 2) return null;
  const idx = Number(parts[1]);
  if (!Number.isInteger(idx) || idx < 0) return null;
  return shortlist[idx]?.title_snapshot ?? null;
}

type ResolvedTitle = {
  title: string;
  year: string | null;
  mediaType: "movie" | "tv";
  posterPath: string | null;
  infoUrl: string;
};

function resolveTitleData({
  group,
  titleId,
  titleCache,
  shortlistFallback,
}: {
  group: Group;
  titleId: string;
  titleCache: Record<string, TitleSnapshot>;
  shortlistFallback: Record<string, ShortlistSnapshot>;
}): ResolvedTitle {
  const snapshot = titleCache[titleId] ?? shortlistFallback[titleId] ?? null;
  if (snapshot) {
    const parsed = parseTmdbTitleKey(titleId);
    const infoUrl = parsed
      ? `https://www.themoviedb.org/${parsed.type}/${parsed.id}`
      : `https://www.themoviedb.org/search?query=${encodeURIComponent(snapshot.title)}`;
    return {
      title: snapshot.title,
      year: snapshot.year ?? null,
      mediaType: snapshot.media_type,
      posterPath: snapshot.poster_path ?? null,
      infoUrl,
    };
  }

  if (titleId.startsWith("sl:")) {
    const parts = titleId.split(":");
    const idx = Number(parts[1] ?? -1);
    const fallbackName =
      Number.isInteger(idx) && idx >= 0 ? group.settings.shortlistItems[idx] ?? titleId : titleId;
    return {
      title: fallbackName,
      year: null,
      mediaType: "movie",
      posterPath: null,
      infoUrl: `https://www.themoviedb.org/search?query=${encodeURIComponent(fallbackName)}`,
    };
  }

  const parsed = parseTmdbTitleKey(titleId);
  if (parsed) {
    return {
      title: titleId,
      year: null,
      mediaType: parsed.type,
      posterPath: null,
      infoUrl: `https://www.themoviedb.org/${parsed.type}/${parsed.id}`,
    };
  }

  const t = TITLES.find((x) => x.id === titleId);
  if (t) {
    return {
      title: t.name,
      year: t.year ? String(t.year) : null,
      mediaType: t.type === "movie" ? "movie" : "tv",
      posterPath: null,
      infoUrl: titleSearchUrl(t),
    };
  }

  return {
    title: titleId,
    year: null,
    mediaType: "movie",
    posterPath: null,
    infoUrl: `https://www.themoviedb.org/search?query=${encodeURIComponent(titleId)}`,
  };
}

function ResultCard({
  row,
  resolved,
}: {
  row: AggregatedRow;
  resolved: ResolvedTitle;
}) {
  const posterUrl = resolved.posterPath
    ? `https://image.tmdb.org/t/p/w185${resolved.posterPath}`
    : null;

  return (
    <div className="rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3">
      <div className="flex items-start gap-3">
        <div className="h-20 w-14 shrink-0 overflow-hidden rounded-md border border-white/10 bg-white/5">
          {posterUrl ? (
            <img src={posterUrl} alt={resolved.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-white/45">No art</div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <a
            href={resolved.infoUrl}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-sm font-semibold text-white hover:underline"
          >
            {resolved.title}
          </a>
          <div className="mt-1 flex items-center gap-2 text-xs text-white/65">
            <span>{resolved.year ?? "Unknown year"}</span>
            <Pill>{resolved.mediaType === "movie" ? "Movie" : "Show"}</Pill>
          </div>
          <div className="mt-2 text-sm text-white/85">
            <span className="font-semibold text-[rgb(var(--yellow))]">{starsVisual(row.avg)}</span>{" "}
            <span>{starsText(row.avg)}</span>
          </div>
          <div className="mt-1 text-xs text-white/65">{row.votes} rated</div>
        </div>
      </div>
    </div>
  );
}

export default function ResultsPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;
  const router = useRouter();

  const [group, setGroup] = useState<Group | null>(null);
  const [rows, setRows] = useState<GroupRatingsResult | null>(null);
  const [isLoadingRows, setIsLoadingRows] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeMember, setActiveMember] = useState<ReturnType<typeof getActiveMember>>(null);
  const [shortlistFallback, setShortlistFallback] = useState<Record<string, ShortlistSnapshot>>({});
  const [titleCache, setTitleCache] = useState<Record<string, TitleSnapshot>>({});
  const updatingTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const shownAtRef = useRef<number | null>(null);
  const isUpdatingRef = useRef(false);

  function setUpdatingVisible(next: boolean) {
    isUpdatingRef.current = next;
    setIsUpdating(next);
  }

  function beginUpdatingIndicator() {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (updatingTimerRef.current || isUpdatingRef.current) return;
    updatingTimerRef.current = window.setTimeout(() => {
      shownAtRef.current = Date.now();
      setUpdatingVisible(true);
      updatingTimerRef.current = null;
    }, 300);
  }

  function endUpdatingIndicator() {
    if (updatingTimerRef.current) {
      window.clearTimeout(updatingTimerRef.current);
      updatingTimerRef.current = null;
    }
    if (!isUpdatingRef.current) return;
    const shownAt = shownAtRef.current ?? Date.now();
    const elapsed = Date.now() - shownAt;
    const wait = Math.max(0, 450 - elapsed);
    hideTimerRef.current = window.setTimeout(() => {
      shownAtRef.current = null;
      setUpdatingVisible(false);
      hideTimerRef.current = null;
    }, wait);
  }

  useEffect(() => {
    let alive = true;
    let inFlight = false;
    setIsLoadingRows(true);
    setGroup(loadGroup(groupId));
    setActiveMember(getActiveMember(groupId));

    const fetchRatings = async (opts?: { background?: boolean }) => {
      if (inFlight) return;
      inFlight = true;
      const background = opts?.background ?? false;
      if (background) beginUpdatingIndicator();

      try {
        const loaded = await getGroupRatings(groupId);
        if (!alive) return;
        setRows(loaded);
      } finally {
        if (!alive) return;
        setIsLoadingRows(false);
        if (background) endUpdatingIndicator();
        inFlight = false;
      }
    };

    void fetchRatings();
    const intervalId = window.setInterval(() => {
      void fetchRatings({ background: true });
    }, 3000);

    return () => {
      alive = false;
      if (updatingTimerRef.current) {
        window.clearTimeout(updatingTimerRef.current);
      }
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
      }
      window.clearInterval(intervalId);
    };
  }, [groupId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const shortlist = await getShortlist(groupId);
      if (!alive) return;
      const map: Record<string, ShortlistSnapshot> = {};
      for (const item of shortlist) {
        map[item.title_key] = item.title_snapshot;
      }
      const slRows = (rows?.rows ?? []).map((r) => r.titleId).filter((id) => id.startsWith("sl:"));
      for (const titleId of slRows) {
        const snapshot = resolveShortlistSnapshotByTitleId(titleId, shortlist);
        if (snapshot) map[titleId] = snapshot;
      }
      setShortlistFallback(map);
    })();
    return () => {
      alive = false;
    };
  }, [groupId, rows?.rows]);

  useEffect(() => {
    let alive = true;
    const titleIds = (rows?.rows ?? []).map((row) => row.titleId);
    if (titleIds.length === 0) {
      setTitleCache({});
      return;
    }
    (async () => {
      const snapshots = await getTitleSnapshots(titleIds);
      if (!alive) return;
      setTitleCache(snapshots);
    })();
    return () => {
      alive = false;
    };
  }, [rows?.rows]);

  const top = useMemo(() => {
    if (!rows) return [];
    return rows.rows.slice(0, 10);
  }, [rows]);

  const resolvedTop = useMemo(() => {
    if (!group) return [];
    return top.map((row) => ({
      row,
      resolved: resolveTitleData({
        group,
        titleId: row.titleId,
        titleCache,
        shortlistFallback,
      }),
    }));
  }, [top, titleCache, shortlistFallback, group]);

  useEffect(() => {
    if (!group) return;
    for (const row of top) {
      if (titleCache[row.titleId]) continue;
      const resolved = resolveTitleData({
        group,
        titleId: row.titleId,
        titleCache,
        shortlistFallback,
      });
      if (!resolved.title) continue;
      void upsertTitleSnapshot(row.titleId, {
        title_id: row.titleId,
        title: resolved.title,
        year: resolved.year,
        media_type: resolved.mediaType,
        poster_path: resolved.posterPath,
        overview: null,
      });
    }
  }, [group, top, titleCache, shortlistFallback]);

  if (!group) {
    return (
      <AppShell>
        <StateCard
          title="Group not found"
          badge="Check link"
          description="This group does not exist on this device yet."
          actionHref="/create"
          actionLabel="Create a group"
        />
      </AppShell>
    );
  }

  const members = rows?.members ?? [];
  const accessDenied = rows?.accessDenied === true;
  const networkError = rows?.error === "network" && members.length === 0 && top.length === 0;

  if (accessDenied) {
    return (
      <AppShell>
        <StateCard
          title="Join to see results"
          badge="Members only"
          description={
            activeMember
              ? "Your current profile does not have access to shared results for this group."
              : "Join this group from the hub first, then come back to results."
          }
          actionHref={`/g/${groupId}`}
          actionLabel="Go to hub"
          actionVariant="secondary"
        />
      </AppShell>
    );
  }

  if (!isLoadingRows && networkError) {
    return (
      <AppShell>
        <StateCard
          title="Network error"
          badge="Try again"
          description="We could not refresh shared results. Check your connection and reopen this page."
          actionHref={`/g/${groupId}`}
          actionLabel="Back to hub"
          actionVariant="secondary"
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">Results</h1>
            <div className="mt-1 text-sm text-white/60">{group.name}</div>
          </div>
          <div className="flex items-center gap-2">
            <Pill>{members.length} member(s)</Pill>
            <Pill>Live</Pill>
          </div>
        </div>

        <Card>
          <CardTitle>Top picks</CardTitle>
          <div className="mt-2">
            <Muted>Average excludes skips. Higher votes ranks above ties.</Muted>
            {isUpdating ? <div className="mt-1 text-sm text-white/55">Updating...</div> : null}
          </div>

          {isLoadingRows ? (
            <div className="mt-4 space-y-2">
              <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-white/10" />
            </div>
          ) : null}

          <div className="mt-4">
            {isLoadingRows ? (
              <div className="space-y-2">
                <div className="h-24 animate-pulse rounded-xl bg-white/10" />
                <div className="h-24 animate-pulse rounded-xl bg-white/10" />
                <div className="h-24 animate-pulse rounded-xl bg-white/10" />
              </div>
            ) : resolvedTop.length === 0 ? (
              <div className="py-2 text-sm text-white/70">No ratings yet. Go rate a few titles.</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {resolvedTop.map((item) => (
                  <ResultCard key={item.row.titleId} row={item.row} resolved={item.resolved} />
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => router.push(`/g/${groupId}/rate`)}>Keep rating</Button>
            <Button variant="secondary" onClick={() => router.push(`/g/${groupId}`)}>
              Hub
            </Button>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

