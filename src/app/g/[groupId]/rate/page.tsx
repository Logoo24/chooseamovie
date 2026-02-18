"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { StateCard } from "@/components/StateCard";
import { StarRating } from "@/components/StarRating";
import { Button, Card, CardTitle, Muted, Pill } from "@/components/ui";
import {
  consumeUpcomingTitle,
  ensureEndlessQueue,
  getUpcomingQueue,
  type EndlessQueueItem,
} from "@/lib/endlessQueueStore";
import { customListLabel, ratingModeLabel } from "@/lib/groupLabels";
import { getHostDisplayName } from "@/lib/hostProfileStore";
import { isHostForGroup } from "@/lib/hostStore";
import { useToast } from "@/components/useToast";
import { ensureMember } from "@/lib/memberStore";
import { setRating as setRatingValue } from "@/lib/ratingStore";
import { upsertTitleSnapshot } from "@/lib/titleCacheStore";
import { loadGroup, type Group } from "@/lib/storage";
import {
  countRated,
  getActiveMember,
  loadRatings,
  setActiveMember,
  type Member,
  type RatingValue,
} from "@/lib/ratings";

type RateTitle = {
  id: string;
  name: string;
  type: "movie" | "tv";
  tmdbType?: "movie" | "tv";
  tmdbId?: number;
  year?: string;
  genre?: string;
  posterPath?: string | null;
  description?: string;
  infoUrl: string;
};

function makeCustomListTitles(items: string[], genreLabel: string): RateTitle[] {
  return items.map((name, idx) => ({
    id: `sl:${idx}:${name.toLowerCase().replace(/\s+/g, "-").slice(0, 40)}`,
    name,
    type: "movie",
    genre: genreLabel,
    infoUrl: `https://www.themoviedb.org/search?query=${encodeURIComponent(name)}`,
  }));
}

function mapQueueToRateTitle(item: EndlessQueueItem): RateTitle {
  return {
    id: item.title_id,
    name: item.title,
    type: item.type,
    tmdbType: item.type,
    tmdbId: item.id,
    year: item.year ?? undefined,
    genre: item.type === "movie" ? "Trending Movie" : "Trending Show",
    posterPath: item.poster_path,
    description: item.overview,
    infoUrl: `https://www.themoviedb.org/${item.type}/${item.id}`,
  };
}

function PosterCard({ title }: { title: RateTitle }) {
  const genre = title.genre ?? "Movie Night";
  const badge = title.type === "movie" ? "Movie" : "Show";
  const posterSrc = title.posterPath ? `https://image.tmdb.org/t/p/w342${title.posterPath}` : null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[rgb(var(--card))]">
      <div className="absolute inset-0 opacity-40">
        <div className="h-full w-full bg-gradient-to-br from-[rgb(var(--red))]/25 via-white/5 to-[rgb(var(--yellow))]/15" />
      </div>

      <div className="relative p-4">
        {posterSrc ? (
          <div className="mb-4 overflow-hidden rounded-xl border border-white/10 bg-white/5">
            <img src={posterSrc} alt={title.name} className="h-56 w-full object-cover sm:h-72" />
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <Pill>{badge}</Pill>
        </div>

        <div className="mt-4">
          <div className="text-xl font-semibold tracking-tight">{title.name}</div>
          <div className="mt-1 text-sm text-white/65">
            {title.year ? title.year : " "} {title.year ? "| " : ""}
            {genre}
          </div>
          {title.description ? <div className="mt-2 text-sm text-white/70">{title.description}</div> : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={title.infoUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white/85 hover:bg-white/10"
          >
            More info
          </a>
        </div>
      </div>
    </div>
  );
}

export default function RatePage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;
  const router = useRouter();
  const { show, Toast } = useToast();

  const [group, setGroup] = useState<Group | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isHost, setIsHost] = useState(false);

  const [member, setMember] = useState<Member | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentStars, setCurrentStars] = useState(0);

  const [ratedCount, setRatedCount] = useState(0);
  const [unratedTitles, setUnratedTitles] = useState<RateTitle[]>([]);
  const [isRefreshingQueue, setIsRefreshingQueue] = useState(false);

  const [showInvite, setShowInvite] = useState(false);
  const [redirectingToHub, setRedirectingToHub] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [isLoadingProviders, setIsLoadingProviders] = useState(false);
  const [providerLogos, setProviderLogos] = useState<
    Array<{ provider_id: number; provider_name: string; logo_path: string | null }>
  >([]);
  const [providersLink, setProvidersLink] = useState("");

  type ProvidersResponse = {
    tmdb_link?: string;
    prioritized?: Array<{
      provider_id: number;
      provider_name: string;
      logo_path: string | null;
      access_type: "flatrate" | "rent" | "buy";
    }>;
  };

  useEffect(() => {
    let alive = true;
    setIsBootstrapping(true);

    (async () => {
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
      setRedirectingToHub(true);
      setIsBootstrapping(false);
      router.replace(`/g/${groupId}`);
    })();

    return () => {
      alive = false;
    };
  }, [groupId]);

  const inviteLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/g/${groupId}`;
  }, [groupId]);

  useEffect(() => {
    let alive = true;
    if (!group || !member) return;

    const refresh = async () => {
      const ratings = loadRatings(groupId, member.id);
      setRatedCount(countRated(ratings));

      if (group.settings.ratingMode === "shortlist") {
        const catalog = makeCustomListTitles(
          group.settings.shortlistItems || [],
          customListLabel(group.settings.contentType)
        );
        const unrated = catalog.filter((t) => ratings[t.id] === undefined);
        if (!alive) return;
        setUnratedTitles(unrated);
        setCurrentIndex(0);
        setCurrentStars(0);
        return;
      }

      setIsRefreshingQueue(true);
      const queue = await ensureEndlessQueue(groupId, member.id, group.settings);
      if (!alive) return;
      setIsRefreshingQueue(false);

      const queueTitles = queue.map(mapQueueToRateTitle);
      setUnratedTitles(queueTitles);
      setCurrentIndex(0);
      setCurrentStars(0);
    };

    void refresh();
    return () => {
      alive = false;
      setIsRefreshingQueue(false);
    };
  }, [group, member, groupId]);

  const currentTitle = unratedTitles[currentIndex] ?? null;

  useEffect(() => {
    if (!currentTitle || group?.settings.ratingMode === "shortlist") return;
    void upsertTitleSnapshot(currentTitle.id, {
      title_id: currentTitle.id,
      title: currentTitle.name,
      year: currentTitle.year ?? null,
      poster_path: currentTitle.posterPath ?? null,
      media_type: currentTitle.type,
      overview: currentTitle.description ?? null,
    });
  }, [currentTitle, group?.settings.ratingMode]);

  useEffect(() => {
    let alive = true;
    setShowDetails(false);
    setProviderLogos([]);
    setProvidersLink("");

    if (!currentTitle?.tmdbType || !currentTitle.tmdbId) return;

    const run = async () => {
      setIsLoadingProviders(true);
      try {
        const response = await fetch(
          `/api/tmdb/providers?type=${currentTitle.tmdbType}&id=${currentTitle.tmdbId}`
        );
        const body = (await response.json()) as ProvidersResponse;
        if (!response.ok || !alive) return;

        const logos = (body.prioritized ?? [])
          .filter((item) => item.logo_path)
          .slice(0, 4)
          .map((item) => ({
            provider_id: item.provider_id,
            provider_name: item.provider_name,
            logo_path: item.logo_path,
          }));

        setProviderLogos(logos);
        setProvidersLink(body.tmdb_link ?? currentTitle.infoUrl);
      } catch {
        // fallback link handled below
      } finally {
        if (alive) setIsLoadingProviders(false);
      }
    };

    void run();
    return () => {
      alive = false;
      setIsLoadingProviders(false);
    };
  }, [currentTitle?.id, currentTitle?.tmdbId, currentTitle?.tmdbType, currentTitle?.infoUrl]);

  const progressLabel = useMemo(() => {
    const total = unratedTitles.length;
    if (!member) return "";
    return total === 0 ? "All caught up" : `${currentIndex + 1} of ${total}`;
  }, [unratedTitles.length, currentIndex, member]);

  async function advance(ratedTitleId?: string) {
    if (!member) return;
    if (ratedTitleId && group?.settings.ratingMode !== "shortlist") {
      if (!group) return;
      consumeUpcomingTitle(groupId, member.id, ratedTitleId);
      const queue = getUpcomingQueue(groupId, member.id);
      setUnratedTitles(queue.map(mapQueueToRateTitle));
      if (queue.length <= 2) {
        setIsRefreshingQueue(true);
        const refilled = await ensureEndlessQueue(groupId, member.id, group.settings);
        setUnratedTitles(refilled.map(mapQueueToRateTitle));
        setIsRefreshingQueue(false);
      }
      setCurrentIndex(0);
      setCurrentStars(0);
      return;
    }

    setCurrentStars(0);
    setCurrentIndex((i) => Math.min(i + 1, unratedTitles.length));
  }

  async function rate(value: RatingValue) {
    if (!member || !currentTitle) return;
    await setRatingValue(groupId, member.id, currentTitle.id, value);
    setRatedCount((c) => c + 1);

    await advance(currentTitle.id);
  }

  if (isBootstrapping) {
    return (
      <AppShell>
        <StateCard
          title="Loading rating flow"
          badge="Please wait"
          description="Getting your group and member details ready."
        />
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

  if (!member && !isHost) {
    return (
      <AppShell>
        <StateCard
          title="Join from hub first"
          badge="Members only"
          description="Open the group hub, join with your name, then return here to rate."
          actionHref={`/g/${groupId}`}
          actionLabel="Go to hub"
          actionVariant="secondary"
        />
      </AppShell>
    );
  }

  if (!member || redirectingToHub) {
    return (
      <AppShell>
        <StateCard
          title="Opening group hub"
          badge="Please wait"
          description="You need to join from the hub before rating."
          actionHref={`/g/${groupId}`}
          actionLabel="Go to hub"
          actionVariant="secondary"
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      {Toast}
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">Rate</h1>
            <div className="mt-1 text-sm text-white/60">
              {group.name} | {member.name}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Pill>{ratingModeLabel(group.settings)}</Pill>
            <Pill>{progressLabel}</Pill>
            <Pill>{ratedCount} rated</Pill>
            {group.settings.ratingMode !== "shortlist" && isRefreshingQueue ? <Pill>Updating queue...</Pill> : null}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setShowInvite((v) => !v)}>
            Invite
          </Button>
          <Button variant="ghost" onClick={() => router.push(`/g/${groupId}`)}>
            Hub
          </Button>
          <Button variant="ghost" onClick={() => router.push(`/g/${groupId}/results`)}>
            Results
          </Button>
        </div>

        {showInvite ? (
          <Card>
            <CardTitle>Invite link</CardTitle>
            <div className="mt-3 space-y-3">
              <div className="rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3 text-sm text-white/85">
                <div className="break-all">{inviteLink}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={async () => {
                    await navigator.clipboard.writeText(inviteLink);
                    show("Invite link copied");
                  }}
                >
                  Copy link
                </Button>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    if (navigator.share) {
                      try {
                        await navigator.share({ title: "ChooseAMovie", url: inviteLink });
                      } catch {
                        // user canceled
                      }
                    } else {
                      await navigator.clipboard.writeText(inviteLink);
                      show("Copied (share not supported)");
                    }
                  }}
                >
                  Share
                </Button>
              </div>
              <Muted>Share this link so everyone joins the same group.</Muted>
            </div>
          </Card>
        ) : null}

        {currentTitle ? (
          <div className="space-y-4">
            <PosterCard title={currentTitle} />

            <Card>
              <CardTitle>Where to watch</CardTitle>
              <div className="mt-3 space-y-3">
                {isLoadingProviders ? (
                  <Muted>Checking US providers...</Muted>
                ) : providerLogos.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {providerLogos.map((provider) => (
                      <div
                        key={provider.provider_id}
                        className="h-10 w-10 overflow-hidden rounded-md border border-white/10 bg-white/5"
                        title={provider.provider_name}
                      >
                        <img
                          src={`https://image.tmdb.org/t/p/w92${provider.logo_path}`}
                          alt={provider.provider_name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                ) : null}

                {providerLogos.length === 0 && !isLoadingProviders ? (
                  <a
                    href={providersLink || currentTitle.infoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-semibold text-white/90 underline underline-offset-4"
                  >
                    Search online
                  </a>
                ) : (
                  <a
                    href={providersLink || currentTitle.infoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-white/70 underline underline-offset-4"
                  >
                    View full availability
                  </a>
                )}

                <Button variant="ghost" onClick={() => setShowDetails((v) => !v)}>
                  {showDetails ? "Hide details" : "Details"}
                </Button>

                {showDetails ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/80">
                    <div className="font-semibold text-white">{currentTitle.name}</div>
                    <div className="mt-1 text-white/70">
                      {currentTitle.year ?? "Unknown year"} | {currentTitle.type === "movie" ? "Movie" : "Show"}
                    </div>
                    {currentTitle.description ? (
                      <div className="mt-2 text-white/70">{currentTitle.description}</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </Card>

            <Card>
              <CardTitle>How interested are you?</CardTitle>
              <div className="mt-4 space-y-4">
                <StarRating
                  value={currentStars}
                  onChange={(v) => setCurrentStars(v)}
                  showLabels
                  showNumericHint
                />

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    onClick={() => {
                      if (currentStars === 0) {
                        show("Pick stars first, or skip");
                        return;
                      }
                      void rate(currentStars as RatingValue);
                      show("Saved");
                    }}
                  >
                    Save rating
                  </Button>

                  <Button
                    variant="secondary"
                    onClick={() => {
                      void rate(0);
                      show("Skipped");
                    }}
                  >
                    Skip
                  </Button>
                </div>

                <Muted>Use Skip when you do not know a title or do not want to rate it.</Muted>
              </div>
            </Card>
          </div>
        ) : (
          <Card>
            <CardTitle>You are caught up</CardTitle>
            <div className="mt-2">
              <Muted>You have rated everything available in this mode.</Muted>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => router.push(`/g/${groupId}/results`)}>View results</Button>
              <Button variant="secondary" onClick={() => router.push(`/g/${groupId}`)}>
                Hub
              </Button>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
