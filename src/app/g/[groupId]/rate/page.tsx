"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PosterImage } from "@/components/PosterImage";
import { StateCard } from "@/components/StateCard";
import { StarRating } from "@/components/StarRating";
import { Button, Card, CardTitle, LoadingSpinner, Muted, Pill } from "@/components/ui";
import {
  consumeUpcomingTitle,
  ensureEndlessQueue,
  getUpcomingQueue,
  type EndlessQueueItem,
} from "@/lib/endlessQueueStore";
import { customListLabel } from "@/lib/groupLabels";
import { getHostDisplayName } from "@/lib/hostProfileStore";
import { isHostForGroup } from "@/lib/hostStore";
import { ensureMember, getCurrentGroupMember } from "@/lib/memberStore";
import { setRating as setRatingValue } from "@/lib/ratingStore";
import { ensureAuth } from "@/lib/api";
import {
  getTitleSnapshots,
  upsertTitleSnapshot,
  type TitleSnapshot,
} from "@/lib/titleCacheStore";
import { parseTmdbTitleKey } from "@/lib/tmdbTitleKey";
import { getShortlist, type ShortlistItem } from "@/lib/shortlistStore";
import { loadGroup, type Group } from "@/lib/storage";
import {
  clearActiveMember,
  getActiveMember,
  loadRatings,
  setActiveMember,
  type Member,
  type RatingValue,
} from "@/lib/ratings";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type RateTitle = {
  id: string;
  name: string;
  type: "movie" | "tv";
  tmdbType?: "movie" | "tv";
  tmdbId?: number;
  tmdbPayloadKeys?: string[];
  year?: string;
  genre?: string;
  posterPath?: string | null;
  description?: string;
};

type HistoryEntry = {
  title: RateTitle;
  previousValue: RatingValue | undefined;
  mode: "shortlist" | "endless";
  indexBefore: number;
};

type ProvidersResponse = {
  tmdb_link?: string;
  prioritized?: Array<{
    provider_id: number;
    provider_name: string;
    logo_path: string | null;
    access_type: "flatrate" | "rent" | "buy";
  }>;
};

type DetailsResponse = {
  release_date?: string | null;
  mpaa_rating?: string | null;
  genres?: Array<{
    id: number;
    name: string;
  }>;
};

const ENDLESS_PREFETCH_THRESHOLD = 12;
const STAR_ADVANCE_DELAY_MS = 250;

function buildLegacyShortlistTitleId(name: string, idx: number) {
  return `sl:${idx}:${name.toLowerCase().replace(/\s+/g, "-").slice(0, 40)}`;
}

function makeCustomListTitles(
  items: string[],
  genreLabel: string,
  shortlist: ShortlistItem[] = [],
  titleSnapshotsByShortlistId: Record<string, TitleSnapshot> = {}
): RateTitle[] {
  const sourceItems = items.length > 0 ? items : shortlist.map((item) => item.title_snapshot.title);

  return sourceItems.map((name, idx) => {
    const shortlistItem = shortlist[idx];
    const parsed = shortlistItem ? parseTmdbTitleKey(shortlistItem.title_id) : null;
    const titleSnapshot = shortlistItem
      ? titleSnapshotsByShortlistId[shortlistItem.title_id] ?? null
      : null;
    const mediaType = titleSnapshot?.media_type ?? shortlistItem?.title_snapshot.media_type ?? "movie";
    const title = titleSnapshot?.title?.trim() || shortlistItem?.title_snapshot.title || name;
    const overview =
      typeof titleSnapshot?.overview === "string" ? titleSnapshot.overview.trim() : "";

    return {
      id: buildLegacyShortlistTitleId(name, idx),
      name: title,
      type: mediaType,
      tmdbType: parsed?.type,
      tmdbId: parsed?.id,
      year: titleSnapshot?.year ?? shortlistItem?.title_snapshot.year ?? undefined,
      genre: genreLabel,
      posterPath: titleSnapshot?.poster_path ?? shortlistItem?.title_snapshot.poster_path ?? null,
      description: overview || undefined,
    };
  });
}

function mapQueueToRateTitle(item: EndlessQueueItem): RateTitle {
  return {
    id: item.title_id,
    name: item.title,
    type: item.type,
    tmdbType: item.type,
    tmdbId: item.id,
    tmdbPayloadKeys: item.tmdb_payload_keys ?? [],
    year: item.year ?? undefined,
    genre: item.type === "movie" ? "Trending Movie" : "Trending Show",
    posterPath: item.poster_path,
    description: item.overview,
  };
}

function normalizeProviderName(name: string) {
  const n = name.trim();
  if (n === "Google Play Movies" || n === "Google Play") return "Google TV";
  return n;
}

function isLikelyInTheaters(releaseDate?: string | null) {
  if (!releaseDate) return false;
  const released = new Date(releaseDate);
  if (Number.isNaN(released.getTime())) return false;
  const now = Date.now();
  const diffDays = Math.floor((now - released.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= 60;
}

export default function RatePage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;
  const router = useRouter();

  const [group, setGroup] = useState<Group | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [authBlocked, setAuthBlocked] = useState(false);
  const [authRetryKey, setAuthRetryKey] = useState(0);
  const [isHost, setIsHost] = useState(false);
  const [member, setMember] = useState<Member | null>(null);
  const [redirectingToHome, setRedirectingToHome] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentStars, setCurrentStars] = useState(0);
  const [unratedTitles, setUnratedTitles] = useState<RateTitle[]>([]);
  const [isSubmittingStarRating, setIsSubmittingStarRating] = useState(false);
  const [isRefreshingQueue, setIsRefreshingQueue] = useState(false);
  const [isCheckingMoreTitles, setIsCheckingMoreTitles] = useState(false);
  const [didExhaustionProbe, setDidExhaustionProbe] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const [isLoadingProviders, setIsLoadingProviders] = useState(false);
  const [providerItems, setProviderItems] = useState<
    Array<{ provider_id: number; provider_name: string; logo_path: string | null }>
  >([]);
  const [providersLink, setProvidersLink] = useState("");
  const [isInTheaters, setIsInTheaters] = useState(false);
  const [mpaaRating, setMpaaRating] = useState<string | null>(null);
  const [titleGenres, setTitleGenres] = useState<string[]>([]);
  const refillInFlightRef = useRef(false);
  const isMountedRef = useRef(true);
  const currentGroupIdRef = useRef(groupId);
  const currentMemberIdRef = useRef<string | null>(null);
  const pendingStarAdvanceTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    currentGroupIdRef.current = groupId;
  }, [groupId]);

  useEffect(() => {
    currentMemberIdRef.current = member?.id ?? null;
  }, [member?.id]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (pendingStarAdvanceTimeoutRef.current !== null) {
        window.clearTimeout(pendingStarAdvanceTimeoutRef.current);
        pendingStarAdvanceTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setIsBootstrapping(true);
    setAuthBlocked(false);

    (async () => {
      const anonUserId = await ensureAuth();
      if (!alive) return;
      if (!anonUserId) {
        setAuthBlocked(true);
        setIsBootstrapping(false);
        return;
      }

      const g = loadGroup(groupId);
      const host = isHostForGroup(groupId);
      if (!alive) return;
      setGroup(g);
      setIsHost(host);

      const active = getActiveMember(groupId);
      if (active) {
        setMember(active);
        setIsBootstrapping(false);
        return;
      }

      if (g && host) {
        const hostName = getHostDisplayName().trim() || "Host";
        const ensured = await ensureMember(groupId, hostName);
        if (!alive) return;
        setActiveMember(groupId, ensured);
        setMember(ensured);
        setIsBootstrapping(false);
        return;
      }

      if (!alive) return;
      setRedirectingToHome(true);
      setIsBootstrapping(false);
      router.replace(`/g/${groupId}`);
    })();

    return () => {
      alive = false;
    };
  }, [groupId, router, authRetryKey]);

  useEffect(() => {
    const memberId = member?.id ?? null;
    if (!memberId) return;
    let alive = true;
    let fallbackIntervalId: number | null = null;
    let unsubscribeRealtime: (() => void) | null = null;

    const handleMembershipCheck = async () => {
      const mine = await getCurrentGroupMember(groupId);
      if (!alive) return;
      if (mine.member) {
        if (mine.member.id !== memberId) {
          setActiveMember(groupId, mine.member);
          setMember(mine.member);
        }
        return;
      }

      clearActiveMember(groupId);
      setMember(null);
      setRedirectingToHome(true);
      router.replace(`/g/${groupId}?removed=1`);
    };

    void handleMembershipCheck();
    fallbackIntervalId = window.setInterval(() => {
      void handleMembershipCheck();
    }, 30_000);

    if (isSupabaseConfigured() && supabase) {
      const channel = supabase
        .channel(`rate-membership:${groupId}:${memberId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "members", filter: `group_id=eq.${groupId}` },
          () => {
            void handleMembershipCheck();
          }
        )
        .subscribe();
      unsubscribeRealtime = () => {
        void channel.unsubscribe();
      };
    }

    return () => {
      alive = false;
      if (fallbackIntervalId !== null) window.clearInterval(fallbackIntervalId);
      if (unsubscribeRealtime) unsubscribeRealtime();
    };
  }, [groupId, member?.id, router]);

  useEffect(() => {
    let alive = true;
    if (!group || !member) return;

    const refresh = async () => {
      const ratings = loadRatings(groupId, member.id);

      if (group.settings.ratingMode === "shortlist") {
        const shortlist = await getShortlist(groupId);
        if (!alive) return;

        let titleSnapshotsByShortlistId: Record<string, TitleSnapshot> = {};
        if (shortlist.length > 0) {
          try {
            titleSnapshotsByShortlistId = await getTitleSnapshots(
              shortlist.map((item) => item.title_id)
            );
          } catch {
            titleSnapshotsByShortlistId = {};
          }
          if (!alive) return;
        }

        const catalog = makeCustomListTitles(
          group.settings.shortlistItems || [],
          customListLabel(group.settings.contentType),
          shortlist,
          titleSnapshotsByShortlistId
        );
        const unrated = catalog.filter((t) => ratings[t.id] === undefined);
        if (!alive) return;
        setUnratedTitles(unrated);
        setCurrentIndex(0);
        setCurrentStars(0);
        setHistory([]);
        return;
      }

      const cachedQueue = getUpcomingQueue(groupId, member.id);
      if (!alive) return;
      if (cachedQueue.length > 0) {
        setUnratedTitles(cachedQueue.map(mapQueueToRateTitle));
      }
      setCurrentIndex(0);
      setCurrentStars(0);
      setHistory([]);

      refillInFlightRef.current = true;
      setIsRefreshingQueue(true);
      try {
        const queue = await ensureEndlessQueue(groupId, member.id, group.settings);
        if (!alive) return;
        setUnratedTitles(queue.map(mapQueueToRateTitle));
      } finally {
        refillInFlightRef.current = false;
        if (alive) {
          setIsRefreshingQueue(false);
        }
      }
    };

    void refresh();
    return () => {
      alive = false;
      refillInFlightRef.current = false;
      setIsRefreshingQueue(false);
    };
  }, [group, member, groupId]);

  const currentTitle = unratedTitles[currentIndex] ?? null;
  const currentTitleId = currentTitle?.id ?? null;
  const isCustomListMode = group?.settings.ratingMode === "shortlist";
  const remainingCount = Math.max(0, unratedTitles.length - currentIndex);

  useEffect(() => {
    setIsCheckingMoreTitles(false);
    setDidExhaustionProbe(false);
  }, [groupId, member?.id, group?.settings.ratingMode]);

  useEffect(() => {
    if (currentTitleId) {
      setDidExhaustionProbe(false);
    }
  }, [currentTitleId]);

  useEffect(() => {
    let alive = true;
    if (!group || !member || isCustomListMode) return;
    if (currentTitleId) return;
    if (isRefreshingQueue || isCheckingMoreTitles || didExhaustionProbe) return;

    (async () => {
      setIsCheckingMoreTitles(true);
      try {
        const queue = await ensureEndlessQueue(groupId, member.id, group.settings);
        if (!alive) return;
        setUnratedTitles(queue.map(mapQueueToRateTitle));
        setCurrentIndex(0);
        setCurrentStars(0);
      } finally {
        if (!alive) return;
        setDidExhaustionProbe(true);
        setIsCheckingMoreTitles(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [
    currentTitleId,
    didExhaustionProbe,
    group,
    groupId,
    isCheckingMoreTitles,
    isCustomListMode,
    isRefreshingQueue,
    member,
  ]);

  useEffect(() => {
    if (!currentTitleId || !currentTitle || !group || group.settings.ratingMode === "shortlist") return;
    void upsertTitleSnapshot(currentTitleId, {
      title_id: currentTitleId,
      title: currentTitle.name,
      year: currentTitle.year ?? null,
      poster_path: currentTitle.posterPath ?? null,
      media_type: currentTitle.type,
      overview: currentTitle.description ?? null,
    }, {
      callSite: "RatePage.currentTitle",
      upstreamPayloadKeys: currentTitle.tmdbPayloadKeys ?? [],
      tmdbSucceeded: true,
    });
  }, [currentTitle, currentTitleId, group]);

  useEffect(() => {
    let alive = true;
    setProviderItems([]);
    setProvidersLink("");
    setIsInTheaters(false);
    setMpaaRating(null);
    setTitleGenres([]);

    if (!currentTitle) return;
    const watchQuery = `watch ${currentTitle.name} ${currentTitle.type === "movie" ? "movie" : "show"}`;
    setProvidersLink(`https://www.google.com/search?q=${encodeURIComponent(watchQuery)}`);

    if (!currentTitle.tmdbType || !currentTitle.tmdbId) return;

    const run = async () => {
      setIsLoadingProviders(true);
      try {
        const providersRes = await fetch(
          `/api/tmdb/providers?type=${currentTitle.tmdbType}&id=${currentTitle.tmdbId}`
        );
        const providersBody = (await providersRes.json()) as ProvidersResponse;
        if (!providersRes.ok || !alive) return;

        const providers = (providersBody.prioritized ?? [])
          .slice(0, 4)
          .map((item) => ({
            provider_id: item.provider_id,
            provider_name: normalizeProviderName(item.provider_name),
            logo_path: item.logo_path,
          }));

        setProviderItems(providers);

        const detailsRes = await fetch(
          `/api/tmdb/details?type=${currentTitle.tmdbType}&id=${currentTitle.tmdbId}`
        );
        const detailsBody = (await detailsRes.json()) as DetailsResponse;
        if (!alive || !detailsRes.ok) return;

        const genres = Array.isArray(detailsBody.genres)
          ? detailsBody.genres
              .map((genre) => genre.name?.trim() ?? "")
              .filter((name): name is string => name.length > 0)
          : [];
        setTitleGenres(genres);

        if (currentTitle.tmdbType === "movie") {
          setMpaaRating(detailsBody.mpaa_rating?.trim() || null);
          if (isLikelyInTheaters(detailsBody.release_date ?? null)) {
            setIsInTheaters(true);
          }
        }
      } catch {
        // fallback link already set
      } finally {
        if (alive) setIsLoadingProviders(false);
      }
    };

    void run();
    return () => {
      alive = false;
      setIsLoadingProviders(false);
    };
  }, [currentTitle, currentTitleId]);

  async function advance(currentTitleId: string) {
    if (!member) return;

    if (!isCustomListMode) {
      consumeUpcomingTitle(groupId, member.id, currentTitleId);
      const queue = getUpcomingQueue(groupId, member.id);
      setUnratedTitles(queue.map(mapQueueToRateTitle));
      setCurrentIndex(0);
      setCurrentStars(0);

      if (queue.length <= ENDLESS_PREFETCH_THRESHOLD && group && !refillInFlightRef.current) {
        const requestGroupId = groupId;
        const requestMemberId = member.id;
        refillInFlightRef.current = true;
        setIsRefreshingQueue(true);

        void ensureEndlessQueue(requestGroupId, requestMemberId, group.settings)
          .then((refilled) => {
            const stillCurrent =
              isMountedRef.current &&
              currentGroupIdRef.current === requestGroupId &&
              currentMemberIdRef.current === requestMemberId;
            if (!stillCurrent) return;
            setUnratedTitles(refilled.map(mapQueueToRateTitle));
            setCurrentIndex(0);
          })
          .finally(() => {
            const stillCurrent =
              isMountedRef.current &&
              currentGroupIdRef.current === requestGroupId &&
              currentMemberIdRef.current === requestMemberId;
            if (stillCurrent) {
              setIsRefreshingQueue(false);
            }
            refillInFlightRef.current = false;
          });
      }
      return;
    }

    setCurrentStars(0);
    setCurrentIndex((i) => Math.min(i + 1, unratedTitles.length));
  }

  async function applyRating(value: RatingValue) {
    if (!member || !currentTitle || !group) return;
    const existing = loadRatings(groupId, member.id)[currentTitle.id] as RatingValue | undefined;
    setHistory((prev) => [
      ...prev,
      {
        title: currentTitle,
        previousValue: existing,
        mode: isCustomListMode ? "shortlist" : "endless",
        indexBefore: currentIndex,
      },
    ]);

    void setRatingValue(groupId, member.id, currentTitle.id, value);
    await advance(currentTitle.id);
  }

  function onStarRate(value: 1 | 2 | 3 | 4 | 5) {
    if (isSubmittingStarRating) return;
    setCurrentStars(value);
    setIsSubmittingStarRating(true);

    if (pendingStarAdvanceTimeoutRef.current !== null) {
      window.clearTimeout(pendingStarAdvanceTimeoutRef.current);
      pendingStarAdvanceTimeoutRef.current = null;
    }

    pendingStarAdvanceTimeoutRef.current = window.setTimeout(() => {
      pendingStarAdvanceTimeoutRef.current = null;
      void applyRating(value).finally(() => {
        if (isMountedRef.current) {
          setIsSubmittingStarRating(false);
        }
      });
    }, STAR_ADVANCE_DELAY_MS);
  }

  async function onUndo() {
    if (!member || history.length === 0) return;
    const entry = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));

    if (entry.previousValue !== undefined) {
      await setRatingValue(groupId, member.id, entry.title.id, entry.previousValue);
    }

    if (entry.mode === "endless") {
      setUnratedTitles((prev) => [entry.title, ...prev.filter((item) => item.id !== entry.title.id)]);
      setCurrentIndex(0);
    } else {
      setCurrentIndex(Math.max(0, entry.indexBefore));
    }

    setCurrentStars(entry.previousValue && entry.previousValue > 0 ? entry.previousValue : 0);
  }

  if (isBootstrapping) {
    return (
      <AppShell>
        <StateCard
          title="Loading ratings"
          description="Getting your group and member details ready."
        />
      </AppShell>
    );
  }

  if (authBlocked) {
    return (
      <AppShell>
        <Card>
          <CardTitle>Session required</CardTitle>
          <div className="mt-2">
            <Muted>We could not start your session. Please try again.</Muted>
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
          description="We couldn't find this group."
          actionHref="/create"
          actionLabel="Create a group"
        />
      </AppShell>
    );
  }

  if (!member && !isHost) {
    return (
      <AppShell>
        <StateCard
          title="Join from group home first"
          description="Open group home, join with your name, then come back here to rate."
          actionHref={`/g/${groupId}`}
          actionLabel="Go to group home"
          actionVariant="secondary"
        />
      </AppShell>
    );
  }

  if (!member || redirectingToHome) {
    return (
      <AppShell>
        <StateCard
          title="Opening group home"
          description="You need to join from group home before rating."
          actionHref={`/g/${groupId}`}
          actionLabel="Go to group home"
          actionVariant="secondary"
        />
      </AppShell>
    );
  }

  if (!currentTitle) {
    if (!isCustomListMode && isRefreshingQueue) {
      return (
        <AppShell>
          <div className="space-y-6">
            <Card>
              <CardTitle>Loading titles</CardTitle>
              <div className="mt-2 inline-flex items-center gap-2 text-sm text-white/68">
                <LoadingSpinner className="h-4 w-4" />
                <span>Getting titles ready for rating.</span>
              </div>
            </Card>
          </div>
        </AppShell>
      );
    }

    if (!isCustomListMode && isCheckingMoreTitles) {
      return (
        <AppShell>
          <div className="space-y-6">
            <Card>
              <CardTitle>Finding more titles</CardTitle>
              <div className="mt-2 inline-flex items-center gap-2 text-sm text-white/68">
                <LoadingSpinner className="h-4 w-4" />
                <span>Checking more pages that match your group filters.</span>
              </div>
            </Card>
          </div>
        </AppShell>
      );
    }

    return (
      <AppShell>
        <div className="space-y-6">
          <Card>
            <CardTitle>You are caught up</CardTitle>
            <div className="mt-2">
              <Muted>You have rated everything available in this mode.</Muted>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => router.push(`/g/${groupId}/results`)}>View results</Button>
              <Button variant="secondary" onClick={() => router.push(`/g/${groupId}`)}>
                Home
              </Button>
            </div>
          </Card>
        </div>
      </AppShell>
    );
  }

  const googleQuery = `${currentTitle.name} ${currentTitle.type === "movie" ? "movie" : "show"}`;
  const posterUrl = currentTitle.posterPath ? `https://image.tmdb.org/t/p/w342${currentTitle.posterPath}` : null;

  return (
    <AppShell>
      <div className="space-y-4">
        {isCustomListMode ? (
          <div className="flex justify-center">
            <Pill>{remainingCount} left</Pill>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-[280px_1fr] md:items-start md:gap-4">
          <Card>
            <PosterImage
              src={posterUrl}
              alt={currentTitle.name}
              className="mx-auto w-full max-w-[176px] rounded-xl sm:max-w-[220px] md:max-w-[260px]"
              roundedClassName="rounded-xl"
            />
            {isRefreshingQueue ? (
              <div className="mt-2 inline-flex items-center gap-2 text-xs text-white/55">
                <LoadingSpinner className="h-3.5 w-3.5" />
                <span>Updating queue...</span>
              </div>
            ) : null}
          </Card>

          <div className="space-y-4">
            <Card>
              <CardTitle>Rate this title</CardTitle>
              <div className="mt-3 space-y-3 sm:mt-4 sm:space-y-4">
                <StarRating
                  value={currentStars}
                  onChange={onStarRate}
                  disabled={isSubmittingStarRating}
                  showLabels={false}
                  showNumericHint={false}
                />

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    variant="ghost"
                    onClick={() => void onUndo()}
                    disabled={history.length === 0 || isSubmittingStarRating}
                  >
                    Undo
                  </Button>
                  <Button variant="secondary" onClick={() => void applyRating(0)} disabled={isSubmittingStarRating}>
                    Skip
                  </Button>
                </div>
              </div>
            </Card>

            <Card>
              <CardTitle>{currentTitle.name}</CardTitle>
              <div
                className="mt-2 min-h-[72px] text-sm text-white/70"
                style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}
              >
                {currentTitle.description ?? "No overview available yet."}
              </div>
              <div className="mt-3">
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(googleQuery)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Button variant="secondary">More info</Button>
                </a>
              </div>
            </Card>

            <Card>
              <CardTitle>Where to watch</CardTitle>
              <div className="mt-3 space-y-3 min-h-[112px]">
                {isInTheaters ? (
                  <div className="inline-flex rounded-full border border-[rgb(var(--yellow))]/50 bg-[rgb(var(--yellow))]/15 px-3 py-1 text-xs font-semibold text-[rgb(var(--yellow))]">
                    In theaters
                  </div>
                ) : null}

                {isLoadingProviders ? <Muted>Checking US providers...</Muted> : null}

                {!isLoadingProviders && providerItems.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {providerItems.map((provider) => (
                      <a
                        key={provider.provider_id}
                        href={providersLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1 hover:bg-white/10"
                        title={provider.provider_name}
                      >
                        {provider.logo_path ? (
                          <Image
                            src={`https://image.tmdb.org/t/p/w92${provider.logo_path}`}
                            alt={provider.provider_name}
                            width={24}
                            height={24}
                            className="h-6 w-6 rounded object-contain"
                          />
                        ) : null}
                        <span className="text-xs text-white/85">{provider.provider_name}</span>
                      </a>
                    ))}
                  </div>
                ) : null}

                {!isLoadingProviders && providerItems.length === 0 ? (
                  <a
                    href={providersLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold text-white/90 underline underline-offset-4"
                  >
                    Search online
                  </a>
                ) : null}
              </div>
            </Card>

            <Card>
              <CardTitle>Title metadata</CardTitle>
              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/75">
                <div>{currentTitle.year ?? "Unknown year"} | {currentTitle.type === "movie" ? "Movie" : "Show"}</div>
                <div className="mt-1">{titleGenres.length > 0 ? titleGenres.join(", ") : currentTitle.genre ?? "General"}</div>
                {currentTitle.type === "movie" ? (
                  <div className="mt-1">MPAA: {mpaaRating ?? "Not rated"}</div>
                ) : null}
                {currentTitle.tmdbId ? <div className="mt-1">TMDB ID: {currentTitle.tmdbId}</div> : null}
                {isInTheaters ? <div className="mt-1 text-[rgb(var(--yellow))]">Currently in theaters</div> : null}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

