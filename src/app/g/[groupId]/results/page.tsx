"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { GroupTabs } from "@/components/GroupTabs";
import { PosterImage } from "@/components/PosterImage";
import { StateCard } from "@/components/StateCard";
import { Button, Card, CardTitle, Muted, Pill } from "@/components/ui";
import { getActiveMember } from "@/lib/ratings";
import { getShortlist, type ShortlistItem, type ShortlistSnapshot } from "@/lib/shortlistStore";
import { loadGroup, type Group } from "@/lib/storage";
import { ensureAuth } from "@/lib/api";
import { getTitleSnapshots, type TitleSnapshot } from "@/lib/titleCacheStore";
import { parseTmdbTitleKey } from "@/lib/tmdbTitleKey";
import { getGroupTopTitles, type GroupTopTitle } from "@/lib/topTitlesStore";
import { getGroupRatings } from "@/lib/ratingStore";
import { type Member } from "@/lib/ratings";

const TOP_LIMIT_OPTIONS = [10, 20, 50, 100] as const;

function starsText(avg: number) {
  if (!avg) return "-";
  return avg.toFixed(2);
}

function starsFilledCount(value: number) {
  return Math.max(0, Math.min(5, Math.round(value)));
}

function StarDisplay({ value, size = "md" }: { value: number; size?: "md" | "lg" }) {
  const filled = starsFilledCount(value);
  const sizeClass = size === "lg" ? "text-2xl" : "text-base";
  const stars = Array.from({ length: 5 }, (_, index) => {
    const isFilled = index < filled;
    return (
      <span
        key={index}
        className={
          isFilled
            ? "text-[rgb(var(--yellow))] drop-shadow-[0_0_6px_rgba(255,211,92,0.35)]"
            : "font-light text-white/20"
        }
      >
        {isFilled ? "\u2605" : "\u2606"}
      </span>
    );
  });

  return <span className={`inline-flex items-center gap-0.5 ${sizeClass} leading-none`}>{stars}</span>;
}

function asNumericRating(value: unknown): number | null {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return null;
  if (rating <= 0) return null;
  return rating;
}

function resolveShortlistSnapshotByTitleId(titleId: string, shortlist: ShortlistItem[]) {
  const direct = shortlist.find((item) => item.title_id === titleId);
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
  isResolved: boolean;
};

function googleInfoUrl(title: string, mediaType: "movie" | "tv") {
  const suffix = mediaType === "movie" ? "movie" : "show";
  return `https://www.google.com/search?q=${encodeURIComponent(`${title} ${suffix}`)}`;
}

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
    const mediaType = parsed?.type ?? snapshot.media_type ?? "movie";
    const title = snapshot.title?.trim() ?? "";
    const isPlaceholderTitle = title.length === 0 || title === titleId;
    return {
      title: isPlaceholderTitle ? "Loading title details..." : title,
      year: snapshot.year ?? null,
      mediaType,
      posterPath: snapshot.poster_path ?? null,
      infoUrl: isPlaceholderTitle ? "#" : googleInfoUrl(title, mediaType),
      isResolved: !isPlaceholderTitle,
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
      infoUrl: googleInfoUrl(fallbackName, "movie"),
      isResolved: true,
    };
  }

  const parsed = parseTmdbTitleKey(titleId);
  if (parsed) {
    return {
      title: "Loading title details...",
      year: null,
      mediaType: parsed.type,
      posterPath: null,
      infoUrl: "#",
      isResolved: false,
    };
  }

  return {
    title: "Loading title details...",
    year: null,
    mediaType: "movie",
    posterPath: null,
    infoUrl: "#",
    isResolved: false,
  };
}

function ResultCard({
  row,
  resolved,
  rank,
  showMediaTypePill,
}: {
  row: GroupTopTitle;
  resolved: ResolvedTitle;
  rank: number;
  showMediaTypePill: boolean;
}) {
  const posterUrl = resolved.posterPath
    ? `https://image.tmdb.org/t/p/w185${resolved.posterPath}`
    : null;

  return (
    <div className="rounded-xl border border-white/12 bg-black/28 p-3 transition duration-200 hover:border-white/20 hover:bg-black/34">
      <div className="flex items-start gap-3">
        <div className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/5 text-xs font-semibold text-white/90">
          {rank}
        </div>
        <PosterImage src={posterUrl} alt={resolved.title} className="w-14 shrink-0" />

        <div className="min-w-0 flex-1">
          {resolved.isResolved ? (
            <a
              href={resolved.infoUrl}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-sm font-semibold text-white hover:underline"
            >
              {resolved.title}
            </a>
          ) : (
            <div className="block truncate text-sm font-semibold text-white/70">{resolved.title}</div>
          )}
          <div className="mt-1 flex items-center gap-2 text-xs text-white/65">
            <span>{resolved.year ?? (resolved.isResolved ? "Unknown year" : "Loading year...")}</span>
            {showMediaTypePill ? <Pill>{resolved.mediaType === "movie" ? "Movie" : "Show"}</Pill> : null}
          </div>
          <div className="mt-2 flex items-center gap-2 text-white/95">
            <StarDisplay value={row.avg} size="lg" />
            <span className="text-lg font-bold">{starsText(row.avg)}</span>
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

  const [group, setGroup] = useState<Group | null>(null);
  const [authBlocked, setAuthBlocked] = useState(false);
  const [authRetryKey, setAuthRetryKey] = useState(0);
  const [topRows, setTopRows] = useState<GroupTopTitle[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [accessDenied, setAccessDenied] = useState(false);
  const [readError, setReadError] = useState<"none" | "network">("none");
  const [isLoadingRows, setIsLoadingRows] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [activeMember, setActiveMember] = useState<ReturnType<typeof getActiveMember>>(null);
  const [shortlistFallback, setShortlistFallback] = useState<Record<string, ShortlistSnapshot>>({});
  const [titleCache, setTitleCache] = useState<Record<string, TitleSnapshot>>({});
  const [perMemberRatings, setPerMemberRatings] = useState<Record<string, Record<string, number>>>({});
  const [topLimit, setTopLimit] = useState<(typeof TOP_LIMIT_OPTIONS)[number]>(10);
  const [showMemberRankings, setShowMemberRankings] = useState(false);
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
    setAuthBlocked(false);

    const fetchRatings = async (opts?: { background?: boolean }) => {
      if (inFlight) return;
      inFlight = true;
      const background = opts?.background ?? false;
      if (background) beginUpdatingIndicator();

      try {
        const anonUserId = await ensureAuth();
        if (!alive) return;
        if (!anonUserId) {
          setAuthBlocked(true);
          setIsLoadingRows(false);
          return;
        }

        const [topLoaded, membersLoaded] = await Promise.all([
          getGroupTopTitles(groupId),
          getGroupRatings(groupId),
        ]);
        if (!alive) return;

        setAccessDenied(Boolean(topLoaded.accessDenied || membersLoaded.accessDenied));
        setReadError(
          topLoaded.error === "network" || membersLoaded.error === "network" ? "network" : "none"
        );
        setMembers(membersLoaded.members);
        setPerMemberRatings(membersLoaded.perMember as Record<string, Record<string, number>>);
        setTopRows((current) => {
          if (topLoaded.rows.length === 0 && current.length > 0) return current;
          return topLoaded.rows;
        });
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
  }, [groupId, authRetryKey]);

  useEffect(() => {
    setTopLimit(10);
    setShowMemberRankings(false);
    setShortlistFallback({});
    setTitleCache({});
    setPerMemberRatings({});
  }, [groupId]);

  const memberRatedTitleIds = useMemo(() => {
    const set = new Set<string>();
    for (const memberEntries of Object.values(perMemberRatings)) {
      for (const [titleId, rawRating] of Object.entries(memberEntries)) {
        if (asNumericRating(rawRating) !== null) {
          set.add(titleId);
        }
      }
    }
    return Array.from(set);
  }, [perMemberRatings]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const shortlist = await getShortlist(groupId);
      if (!alive) return;
      const map: Record<string, ShortlistSnapshot> = {};
      for (const item of shortlist) {
        map[item.title_id] = item.title_snapshot;
      }
      const slRows = Array.from(new Set([...topRows.map((r) => r.titleId), ...memberRatedTitleIds])).filter(
        (id) => id.startsWith("sl:")
      );
      for (const titleId of slRows) {
        const snapshot = resolveShortlistSnapshotByTitleId(titleId, shortlist);
        if (snapshot) map[titleId] = snapshot;
      }
      setShortlistFallback((current) => {
        if (Object.keys(map).length === 0) return current;
        return { ...current, ...map };
      });
    })();
    return () => {
      alive = false;
    };
  }, [groupId, topRows, memberRatedTitleIds]);

  useEffect(() => {
    let alive = true;
    const titleIds = Array.from(new Set([...topRows.map((row) => row.titleId), ...memberRatedTitleIds]));
    if (titleIds.length === 0) return;
    (async () => {
      const snapshots = await getTitleSnapshots(titleIds);
      if (!alive) return;
      setTitleCache((current) => ({ ...current, ...snapshots }));
    })();
    return () => {
      alive = false;
    };
  }, [topRows, memberRatedTitleIds]);

  const allRanked = useMemo(() => {
    return topRows.filter((row) => row.votes > 0);
  }, [topRows, memberRatedTitleIds]);

  const top = useMemo(() => {
    return allRanked.slice(0, topLimit);
  }, [allRanked, topLimit]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    console.info("[results] group_top_titles rows", {
      groupId,
      receivedRows: topRows.length,
      rankedRows: allRanked.length,
      selectedCount: topLimit,
    });
  }, [groupId, topRows, allRanked.length, topLimit]);

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

  const memberRankings = useMemo(() => {
    if (!group) return [];
    return members.map((member) => {
      const memberRows = Object.entries(perMemberRatings[member.id] ?? {})
        .map(([titleId, rawRating]) => {
          const rating = asNumericRating(rawRating);
          if (rating === null) return null;
          return {
            titleId,
            rating,
            resolved: resolveTitleData({
              group,
              titleId,
              titleCache,
              shortlistFallback,
            }),
          };
        })
        .filter((row): row is { titleId: string; rating: number; resolved: ResolvedTitle } => row !== null)
        .sort((a, b) => {
          if (b.rating !== a.rating) return b.rating - a.rating;
          return a.resolved.title.localeCompare(b.resolved.title);
        });

      return { member, rows: memberRows };
    });
  }, [group, members, perMemberRatings, titleCache, shortlistFallback]);

  if (authBlocked) {
    return (
      <AppShell>
        <Card>
          <CardTitle>Authentication required</CardTitle>
          <div className="mt-2">
            <Muted>We could not start an anonymous session. Please retry.</Muted>
          </div>
          <div className="mt-4">
            <Button onClick={() => setAuthRetryKey((v) => v + 1)}>Retry</Button>
          </div>
        </Card>
      </AppShell>
    );
  }

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

  const networkError = readError === "network" && members.length === 0 && allRanked.length === 0;
  const showMediaTypePill = group.settings.contentType === "movies_and_shows";

  if (accessDenied) {
    return (
      <AppShell>
        <StateCard
          title="Join to see results"
          badge="Members only"
          description={
            activeMember
              ? "Your current profile does not have access to shared results for this group."
              : "Join this group from Home first, then come back to results."
          }
          actionHref={`/g/${groupId}`}
          actionLabel="Go to Home"
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
          actionLabel="Back to Home"
          actionVariant="secondary"
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <GroupTabs groupId={groupId} />

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
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {resolvedTop.map((item, index) => (
                  <ResultCard
                    key={`top-${item.row.titleId}`}
                    row={item.row}
                    resolved={item.resolved}
                    rank={index + 1}
                    showMediaTypePill={showMediaTypePill}
                  />
                ))}
              </div>
            )}
          </div>

          {allRanked.length > 0 ? (
            <div className="mt-4 space-y-2">
              <div className="text-xs text-white/60">Top list size</div>
              <div className="flex flex-wrap gap-2">
                {TOP_LIMIT_OPTIONS.map((limit) => (
                  <Button
                    key={limit}
                    variant={topLimit === limit ? "primary" : "secondary"}
                    onClick={() => setTopLimit(limit)}
                  >
                    Top {limit}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4">
            <Button variant="secondary" onClick={() => setShowMemberRankings((v) => !v)}>
              {showMemberRankings ? "Hide rankings by member" : "View rankings by member"}
            </Button>
          </div>

          {showMemberRankings ? (
            <div className="mt-4">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-sm font-semibold text-white">Rankings by member</div>
                <div className="mt-1 text-xs text-white/60">
                  Each list is sorted by that member&apos;s highest ratings.
                </div>
                <div className="mt-3 space-y-3">
                  {memberRankings.map(({ member, rows }) => (
                    <div key={member.id} className="rounded-xl border border-white/12 bg-black/28 p-3">
                      <div className="text-sm font-semibold text-white">{member.name}</div>
                      {rows.length === 0 ? (
                        <div className="mt-2 text-xs text-white/60">No ratings yet.</div>
                      ) : (
                        <div className="mt-2 space-y-1.5">
                          {rows.map((row, index) => (
                            <div key={`${member.id}-${row.titleId}`} className="flex items-center justify-between gap-3">
                              <div className="min-w-0 text-sm text-white/85">
                                <span className="text-white/60">{index + 1}.</span>{" "}
                                {row.resolved.isResolved ? row.resolved.title : "Loading title details..."}
                              </div>
                              <div className="shrink-0 text-sm font-semibold text-[rgb(var(--yellow))]">
                                <StarDisplay value={row.rating} size="md" />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </AppShell>
  );
}

