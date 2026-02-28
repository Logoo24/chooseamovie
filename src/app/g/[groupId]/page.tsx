"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PosterImage } from "@/components/PosterImage";
import { StateCard } from "@/components/StateCard";
import { Button, Card, CardTitle, Input, LoadingSpinner, Muted, Pill } from "@/components/ui";
import { customListLabel, isCustomListMode, ratingModeLabel } from "@/lib/groupLabels";
import { ensureEndlessQueue } from "@/lib/endlessQueueStore";
import { getGroup } from "@/lib/groupStore";
import { isHostForGroup } from "@/lib/hostStore";
import {
  getCurrentGroupMember,
  joinGroupMember,
  listGroupMembers,
  removeGroupMember,
} from "@/lib/memberStore";
import { getGroupRatings, type GroupRatingsResult } from "@/lib/ratingStore";
import { clearActiveMember, getActiveMember, setActiveMember, type Member } from "@/lib/ratings";
import { getShortlist, type ShortlistItem, type ShortlistSnapshot } from "@/lib/shortlistStore";
import { ensureAuth, getAuthUserId } from "@/lib/api";
import {
  bootstrapSignedInProfile,
  continueAsGuest,
  getAuthSnapshot,
  sendMagicLink,
  signInWithGoogle,
  subscribeAuthSnapshot,
  type AuthSnapshot,
} from "@/lib/authClient";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { getTitleSnapshots, type TitleSnapshot } from "@/lib/titleCacheStore";
import { parseTmdbTitleKey } from "@/lib/tmdbTitleKey";
import { getGroupTopTitles, type GroupTopTitle } from "@/lib/topTitlesStore";
import { TITLES } from "@/lib/titles";
import { type Group } from "@/lib/storage";

function getKnownAccountName(auth: AuthSnapshot) {
  const displayName = auth.displayName?.trim() ?? "";
  if (displayName) return displayName;
  return null;
}

function ratingLabel(group: Group) {
  const allowedMovieRatings: string[] = [];
  if (group.settings.allowG) allowedMovieRatings.push("G");
  if (group.settings.allowPG) allowedMovieRatings.push("PG");
  if (group.settings.allowPG13) allowedMovieRatings.push("PG-13");
  if (group.settings.allowR) allowedMovieRatings.push("R");

  const movieLabel = `Movies: ${allowedMovieRatings.length > 0 ? allowedMovieRatings.join(", ") : "None"}`;
  if (group.settings.contentType !== "movies_and_shows") {
    return movieLabel;
  }

  const allowedTvRatings: string[] = [];
  if (group.settings.allowTVY) allowedTvRatings.push("TV-Y");
  if (group.settings.allowTVY7) allowedTvRatings.push("TV-Y7");
  if (group.settings.allowTVG) allowedTvRatings.push("TV-G");
  if (group.settings.allowTVPG) allowedTvRatings.push("TV-PG");
  if (group.settings.allowTV14) allowedTvRatings.push("TV-14");
  if (group.settings.allowTVMA) allowedTvRatings.push("TV-MA");

  return `${movieLabel} | TV: ${allowedTvRatings.length > 0 ? allowedTvRatings.join(", ") : "None"}`;
}

function releaseYearRangeLabel(group: Group) {
  if (group.settings.ratingMode !== "unlimited") {
    return "Not used in custom list mode";
  }
  const from = group.settings.endless.releaseFrom?.slice(0, 4) ?? null;
  const to = group.settings.endless.releaseTo?.slice(0, 4) ?? null;
  if (from && to) return `${from} to ${to}`;
  if (from) return `${from}+`;
  if (to) return `Up to ${to}`;
  return "Any year";
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

type PreviewResolved = {
  title: string;
  year: string | null;
  mediaType: "movie" | "tv";
  posterPath: string | null;
  infoUrl: string;
};

function googleInfoUrl(title: string, mediaType: "movie" | "tv") {
  const suffix = mediaType === "movie" ? "movie" : "show";
  return `https://www.google.com/search?q=${encodeURIComponent(`${title} ${suffix}`)}`;
}

function resolvePreviewTitle(
  group: Group,
  titleId: string,
  titleCache: Record<string, TitleSnapshot>,
  shortlistFallback: Record<string, ShortlistSnapshot>
): PreviewResolved {
  const snapshot = titleCache[titleId] ?? shortlistFallback[titleId] ?? null;
  if (snapshot) {
    const parsed = parseTmdbTitleKey(titleId);
    const mediaType = parsed?.type ?? snapshot.media_type;
    return {
      title: snapshot.title,
      year: snapshot.year ?? null,
      mediaType: snapshot.media_type,
      posterPath: snapshot.poster_path ?? null,
      infoUrl: googleInfoUrl(snapshot.title, mediaType),
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
    };
  }

  const parsed = parseTmdbTitleKey(titleId);
  if (parsed) {
    return {
      title: titleId,
      year: null,
      mediaType: parsed.type,
      posterPath: null,
      infoUrl: googleInfoUrl(titleId, parsed.type),
    };
  }

  const match = TITLES.find((item) => item.id === titleId);
  if (match) {
    return {
      title: match.name,
      year: match.year ? String(match.year) : null,
      mediaType: match.type === "movie" ? "movie" : "tv",
      posterPath: null,
      infoUrl: googleInfoUrl(match.name, match.type === "movie" ? "movie" : "tv"),
    };
  }

  return {
    title: titleId,
    year: null,
    mediaType: "movie",
    posterPath: null,
    infoUrl: googleInfoUrl(titleId, "movie"),
  };
}

function starsText(avg: number) {
  return avg ? avg.toFixed(2) : "-";
}

function percentText(value: number) {
  if (!Number.isFinite(value)) return "0.0%";
  return `${value.toFixed(1)}%`;
}

function joinErrorMessage(error: "none" | "invalid_code" | "auth_failed" | "network" | "unknown") {
  if (error === "invalid_code") {
    return "This invite link is invalid or expired. Ask the host to share a fresh group link.";
  }
  if (error === "auth_failed") {
    return "Authentication is required before joining. Retry and try again.";
  }
  if (error === "network") {
    return "Network issue while joining. Check your connection and try again.";
  }
  if (error === "unknown") {
    return "Couldn’t join right now. Please try again.";
  }
  return "";
}

export default function GroupHubPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;
  const router = useRouter();
  const searchParams = useSearchParams();

  const [group, setGroup] = useState<Group | null>(null);
  const [isLoadingGroup, setIsLoadingGroup] = useState(true);
  const [authBlocked, setAuthBlocked] = useState(false);
  const [authRetryKey, setAuthRetryKey] = useState(0);
  const [isHost, setIsHost] = useState(false);
  const [activeMember, setActiveMemberState] = useState<Member | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [ratings, setRatings] = useState<GroupRatingsResult | null>(null);
  const [topRows, setTopRows] = useState<GroupTopTitle[]>([]);
  const [titleCache, setTitleCache] = useState<Record<string, TitleSnapshot>>({});
  const [shortlistFallback, setShortlistFallback] = useState<Record<string, ShortlistSnapshot>>({});
  const [loadError, setLoadError] = useState<
    "none" | "not_found" | "invalid_code" | "auth_failed" | "network"
  >("none");
  const [nameDraft, setNameDraft] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<"none" | "invalid_code" | "auth_failed" | "network" | "unknown">(
    "none"
  );
  const [isRemovingMemberId, setIsRemovingMemberId] = useState<string | null>(null);
  const [memberActionError, setMemberActionError] = useState<"none" | "forbidden" | "network">("none");
  const [memberRemovedNotice, setMemberRemovedNotice] = useState(false);
  const activeMemberId = activeMember?.id ?? null;
  const [authSnapshot, setAuthSnapshot] = useState<AuthSnapshot>({
    userId: null,
    email: null,
    provider: null,
    hasSession: false,
    isAnonymous: false,
  });
  const [isAuthSnapshotReady, setIsAuthSnapshotReady] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPanelOpen, setAuthPanelOpen] = useState(false);
  const [authActionError, setAuthActionError] = useState("");
  const [isStartingGuest, setIsStartingGuest] = useState(false);
  const [isSendingMagicLink, setIsSendingMagicLink] = useState(false);
  const [isStartingGoogleAuth, setIsStartingGoogleAuth] = useState(false);
  const [isPreparingQueue, setIsPreparingQueue] = useState(false);
  const joinNameDraftKey = `chooseamovie:join-name-draft:${groupId}`;
  const knownAccountName = getKnownAccountName(authSnapshot);
  const canUseKnownAccountName =
    Boolean(knownAccountName) && authSnapshot.hasSession && !authSnapshot.isAnonymous && !activeMember;

  useEffect(() => {
    let alive = true;
    setIsLoadingGroup(true);
    setLoadError("none");
    setAuthBlocked(false);

    (async () => {
      const anonUserId = await ensureAuth();
      if (!alive) return;
      if (!anonUserId) {
        setAuthBlocked(true);
        setIsLoadingGroup(false);
        return;
      }

      const uid = await getAuthUserId();
      const loaded = await getGroup(groupId);
      if (!alive) return;

      setGroup(loaded.group);
      setLoadError(loaded.error);

      const hostFromOwner = Boolean(
        loaded.group?.ownerUserId && uid && loaded.group.ownerUserId === uid
      );
      const hostFromLocalFlag = !loaded.group?.ownerUserId && isHostForGroup(groupId);
      const host = hostFromOwner || hostFromLocalFlag;
      setIsHost(host);

      const localActive = getActiveMember(groupId);
      if (localActive) {
        setActiveMemberState(localActive);
        setNameDraft(localActive.name);
      }

      const mine = await getCurrentGroupMember(groupId);
      if (!alive) return;
      if (mine.member) {
        setActiveMember(groupId, mine.member);
        setActiveMemberState(mine.member);
        setNameDraft(mine.member.name);
      }

      setIsLoadingGroup(false);
    })();

    return () => {
      alive = false;
    };
  }, [groupId, authRetryKey]);

  useEffect(() => {
    if (searchParams.get("removed") === "1") {
      setMemberRemovedNotice(true);
    }
  }, [searchParams]);

  useEffect(() => {
    let alive = true;
    const persistedName = typeof window !== "undefined" ? sessionStorage.getItem(joinNameDraftKey) : null;
    if (persistedName && persistedName.trim().length >= 2) {
      setNameDraft(persistedName.trim());
    }

    void getAuthSnapshot().then((snapshot) => {
      if (!alive) return;
      setAuthSnapshot(snapshot);
      setIsAuthSnapshotReady(true);
      const accountName = getKnownAccountName(snapshot);
      if (accountName) {
        setNameDraft((current) => current.trim() || accountName);
      }
      void bootstrapSignedInProfile();
    });

    const unsubscribe = subscribeAuthSnapshot((snapshot) => {
      setAuthSnapshot(snapshot);
      setIsAuthSnapshotReady(true);
      setAuthActionError("");
      const accountName = getKnownAccountName(snapshot);
      if (accountName) {
        setNameDraft((current) => current.trim() || accountName);
      }
      if (!snapshot.isAnonymous) {
        void bootstrapSignedInProfile();
      }
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [joinNameDraftKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      sessionStorage.removeItem(joinNameDraftKey);
      return;
    }
    sessionStorage.setItem(joinNameDraftKey, trimmed);
  }, [nameDraft, joinNameDraftKey]);

  useEffect(() => {
    if (!group || !activeMember || group.settings.ratingMode === "shortlist") {
      setIsPreparingQueue(false);
      return;
    }

    let alive = true;
    setIsPreparingQueue(true);

    void ensureEndlessQueue(groupId, activeMember.id, group.settings).finally(() => {
      if (!alive) return;
      setIsPreparingQueue(false);
    });

    return () => {
      alive = false;
    };
  }, [activeMember, group, groupId]);

  useEffect(() => {
    if (!group || authBlocked) return;
    let alive = true;
    let inFlight = false;
    let scheduledFetchTimer: number | null = null;
    let fallbackIntervalId: number | null = null;
    let unsubscribeRealtime: (() => void) | null = null;

    const fetchSnapshot = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const [memberRes, ratingRes, topRes] = await Promise.all([
          listGroupMembers(groupId),
          getGroupRatings(groupId),
          getGroupTopTitles(groupId),
        ]);

        if (!alive) return;
        const isRemovedByHost = Boolean(activeMemberId && ratingRes.accessDenied);
        if (isRemovedByHost) {
          clearActiveMember(groupId);
          setActiveMemberState(null);
          setMemberRemovedNotice(true);
        }

        setMembers(memberRes.members);
        setRatings(ratingRes);
        setTopRows((current) => {
          if (topRes.rows.length === 0 && current.length > 0) return current;
          return topRes.rows;
        });
      } finally {
        inFlight = false;
      }
    };

    const scheduleFetch = () => {
      if (scheduledFetchTimer !== null) return;
      scheduledFetchTimer = window.setTimeout(() => {
        scheduledFetchTimer = null;
        void fetchSnapshot();
      }, 180);
    };

    void fetchSnapshot();
    fallbackIntervalId = window.setInterval(() => {
      void fetchSnapshot();
    }, 30_000);

    if (isSupabaseConfigured() && supabase) {
      const channel = supabase
        .channel(`group-hub:${groupId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "members", filter: `group_id=eq.${groupId}` },
          scheduleFetch
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "ratings", filter: `group_id=eq.${groupId}` },
          scheduleFetch
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "group_top_titles", filter: `group_id=eq.${groupId}` },
          scheduleFetch
        )
        .subscribe();
      unsubscribeRealtime = () => {
        void channel.unsubscribe();
      };
    }

    return () => {
      alive = false;
      if (scheduledFetchTimer !== null) window.clearTimeout(scheduledFetchTimer);
      if (fallbackIntervalId !== null) window.clearInterval(fallbackIntervalId);
      if (unsubscribeRealtime) unsubscribeRealtime();
    };
  }, [group, groupId, authBlocked, activeMemberId]);

  const inviteLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/g/${groupId}`;
  }, [groupId]);

  const stats = useMemo(() => {
    if (!ratings) {
      return {
        totalSubmitted: 0,
        totalRatings: 0,
        skipCount: 0,
        participationCount: 0,
        participationRate: 0,
        avgRatingsPerMember: 0,
        skipRate: 0,
      };
    }

    let totalSubmitted = 0;
    let totalRatings = 0;
    let skipCount = 0;
    const participatingMembers = new Set<string>();

    for (const [memberId, perMember] of Object.entries(ratings.perMember)) {
      let hasStarRating = false;
      for (const value of Object.values(perMember)) {
        totalSubmitted += 1;
        if (value === 0) {
          skipCount += 1;
        } else if (value > 0) {
          totalRatings += 1;
          hasStarRating = true;
        }
      }
      if (hasStarRating) {
        participatingMembers.add(memberId);
      }
    }

    const memberCount = members.length;
    const participationRate = memberCount > 0 ? (participatingMembers.size / memberCount) * 100 : 0;
    const avgRatingsPerMember = memberCount > 0 ? totalRatings / memberCount : 0;
    const skipRate = totalSubmitted > 0 ? (skipCount / totalSubmitted) * 100 : 0;

    return {
      totalSubmitted,
      totalRatings,
      skipCount,
      participationCount: participatingMembers.size,
      participationRate,
      avgRatingsPerMember,
      skipRate,
    };
  }, [ratings, members.length]);

  const topThree = useMemo(() => {
    return topRows.filter((row) => row.votes > 0).slice(0, 3);
  }, [topRows]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const shortlist = await getShortlist(groupId);
      if (!alive) return;
      const map: Record<string, ShortlistSnapshot> = {};
      for (const item of shortlist) {
        map[item.title_id] = item.title_snapshot;
      }
      const slRows = topThree.map((row) => row.titleId).filter((id) => id.startsWith("sl:"));
      for (const titleId of slRows) {
        const snapshot = resolveShortlistSnapshotByTitleId(titleId, shortlist);
        if (snapshot) map[titleId] = snapshot;
      }
      setShortlistFallback(map);
    })();
    return () => {
      alive = false;
    };
  }, [groupId, topThree]);

  useEffect(() => {
    let alive = true;
    const ids = topThree.map((row) => row.titleId);
    if (ids.length === 0) return;
    (async () => {
      const snapshots = await getTitleSnapshots(ids);
      if (!alive) return;
      setTitleCache((current) => ({ ...current, ...snapshots }));
    })();
    return () => {
      alive = false;
    };
  }, [topThree]);

  async function continueToRating() {
    const trimmed = nameDraft.trim() || knownAccountName || "";
    if (trimmed.length < 2) return;

    setJoinError("none");
    setIsJoining(true);
    try {
      const joined = await joinGroupMember(groupId, trimmed);
      if (!joined.member) {
        const nextError = joined.error === "none" ? "unknown" : joined.error;
        setJoinError(nextError);
        if (nextError === "invalid_code" && process.env.NODE_ENV === "development") {
          console.debug("[joinGroup] invalid invite link", { groupId });
        }
        if (nextError === "auth_failed") {
          setAuthBlocked(true);
        }
        return;
      }

      setActiveMember(groupId, joined.member);
      setActiveMemberState(joined.member);
      setMemberRemovedNotice(false);
      const refreshed = await getGroup(groupId);
      if (refreshed.group) {
        setGroup(refreshed.group);
        if (refreshed.group.settings.ratingMode !== "shortlist") {
          void ensureEndlessQueue(groupId, joined.member.id, refreshed.group.settings);
        }
      } else if (group && group.settings.ratingMode !== "shortlist") {
        void ensureEndlessQueue(groupId, joined.member.id, group.settings);
      }
      router.push(`/g/${groupId}/rate`);
    } finally {
      setIsJoining(false);
    }
  }

  async function removeMember(member: Member) {
    if (!isHost) return;
    if (activeMember?.id === member.id) return;
    if (!window.confirm(`Remove ${member.name} from this group?`)) return;

    setMemberActionError("none");
    setIsRemovingMemberId(member.id);
    try {
      const removed = await removeGroupMember(groupId, member.id);
      if (removed.error !== "none") {
        setMemberActionError(removed.error);
        return;
      }
      const refreshed = await listGroupMembers(groupId);
      setMembers(refreshed.members);
    } finally {
      setIsRemovingMemberId(null);
    }
  }

  async function continueAsGuestAndJoin() {
    if (isStartingGuest || isJoining) return;
    setAuthActionError("");
    setIsStartingGuest(true);
    try {
      const started = await continueAsGuest();
      if (!started.ok) {
        setAuthActionError(started.error ?? "Could not start guest mode.");
        return;
      }
      await continueToRating();
    } finally {
      setIsStartingGuest(false);
    }
  }

  async function sendJoinMagicLink() {
    if (isSendingMagicLink) return;
    setAuthActionError("");
    setIsSendingMagicLink(true);
    try {
      const redirectTo = `${window.location.origin}/g/${groupId}`;
      const sent = await sendMagicLink(authEmail, redirectTo);
      if (!sent.ok) {
        setAuthActionError(sent.error ?? "Could not send sign-in email.");
      }
    } finally {
      setIsSendingMagicLink(false);
    }
  }

  async function startJoinGoogleSignIn() {
    if (isStartingGoogleAuth) return;
    setAuthActionError("");
    setIsStartingGoogleAuth(true);
    try {
      const redirectTo = `${window.location.origin}/g/${groupId}`;
      const started = await signInWithGoogle(redirectTo);
      if (!started.ok) {
        setAuthActionError(started.error ?? "Could not start Google sign-in.");
      }
    } finally {
      setIsStartingGoogleAuth(false);
    }
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

  if (isLoadingGroup) {
    return (
      <AppShell>
        <StateCard
          title="Loading group home"
          description="Loading group details."
        />
      </AppShell>
    );
  }

  if (!group) {
    if (!isHost && loadError !== "network" && loadError !== "auth_failed") {
      return (
        <AppShell>
          <Card>
            <CardTitle>Join this group</CardTitle>
            <div className="mt-2">
              <Muted>
                {canUseKnownAccountName
                  ? `This link is the invite. We'll use ${knownAccountName} from your account when you join.`
                  : "This link is the invite. Enter your name, then join as a guest or sign in to save your results to an account."}
              </Muted>
            </div>
            {joinError !== "none" ? (
              <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
                {joinErrorMessage(joinError)}
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {canUseKnownAccountName ? (
                <>
                  <div className="min-w-[220px] rounded-xl border border-white/12 bg-black/28 px-3 py-2.5 text-sm text-white/85">
                    Joining as {knownAccountName}
                  </div>
                  <Button onClick={continueToRating} disabled={isJoining}>
                    {isJoining ? "Joining..." : "Join and save results"}
                  </Button>
                </>
              ) : (
                <>
                  <Input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    placeholder="Your name"
                    autoComplete="off"
                    className="min-w-[220px]"
                  />
                  <Button
                    onClick={continueAsGuestAndJoin}
                    disabled={isJoining || isStartingGuest || nameDraft.trim().length < 2}
                  >
                    {isJoining || isStartingGuest ? "Joining..." : "Continue as guest"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setAuthPanelOpen((v) => !v)}
                    disabled={nameDraft.trim().length < 2}
                  >
                    {authPanelOpen ? "Hide sign-in options" : "Sign in to save progress"}
                  </Button>
                </>
              )}
              <Button variant="secondary" onClick={() => router.push("/")}>
                Back home
              </Button>
            </div>
            {authPanelOpen ? (
              <div className="mt-3 space-y-3 rounded-xl border border-white/12 bg-black/25 p-3">
                {!isAuthSnapshotReady ? (
                  <Muted>Checking session...</Muted>
                ) : authSnapshot.hasSession && !authSnapshot.isAnonymous ? (
                  <div className="space-y-2">
                    <div className="text-sm text-white/75">
                      Signed in{authSnapshot.email ? ` as ${authSnapshot.email}` : ""}. {knownAccountName ? `We'll use ${knownAccountName} as your name.` : "Join now to save results."}
                    </div>
                    <Button
                      onClick={continueToRating}
                      disabled={isJoining || (!knownAccountName && nameDraft.trim().length < 2)}
                    >
                      {isJoining ? "Joining..." : "Join and save results"}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3 rounded-xl border border-white/12 bg-black/25 p-3">
                      <div className="text-sm font-medium text-white/80">Create an account with email</div>
                      <Input
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        placeholder="Email"
                        autoComplete="email"
                        type="email"
                      />
                      <Button className="w-full" onClick={sendJoinMagicLink} disabled={isSendingMagicLink}>
                        {isSendingMagicLink ? "Sending..." : "Continue with email"}
                      </Button>
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-white/15" />
                        <span className="text-xs uppercase tracking-[0.16em] text-white/55">or</span>
                        <div className="h-px flex-1 bg-white/15" />
                      </div>
                      <Button
                        className="w-full"
                        variant="secondary"
                        onClick={startJoinGoogleSignIn}
                        disabled={isStartingGoogleAuth}
                      >
                        {isStartingGoogleAuth ? "Redirecting..." : "Sign in with Google"}
                      </Button>
                      <Button
                        className="w-full"
                        variant="ghost"
                        onClick={() => router.push(`/signin?next=${encodeURIComponent(`/g/${groupId}`)}`)}
                      >
                        Use email + password
                      </Button>
                    </div>
                  </>
                )}
                {authActionError ? (
                  <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
                    {authActionError}
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>
        </AppShell>
      );
    }

    const title =
      loadError === "network"
        ? "Network error"
        : loadError === "auth_failed"
          ? "Session required"
          : "Group not found";

    return (
      <AppShell>
        <StateCard
          title={title}
          description="We couldn't load this group right now."
          actionHref="/"
          actionLabel="Back home"
          actionVariant="secondary"
        />
      </AppShell>
    );
  }

  const modeLabel = ratingModeLabel(group.settings);
  const contentLabel = group.settings.contentType === "movies" ? "Movies" : "Movies + Shows";
  const inviteSummary = `${contentLabel} • ${modeLabel}`;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{group.name}</h1>
        </div>

        {memberRemovedNotice ? (
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
            You were removed from this group by the host. You can rejoin if invited again.
          </div>
        ) : null}

        {isHost ? (
          <Card>
            <CardTitle>Invite people</CardTitle>
            <div className="mt-1 text-sm text-white/60">{inviteSummary}</div>
            <div className="mt-3 text-sm text-white/70">
              Share this link so people can join and start rating.
            </div>
            <div className="mt-3">
              <div className="rounded-xl border border-white/12 bg-black/28 p-3 text-sm text-white/90 break-all">
                {inviteLink}
              </div>
            </div>
            <div className="mt-3">
              <Button
                onClick={async () => {
                  await navigator.clipboard.writeText(inviteLink);
                }}
              >
                Copy invite link
              </Button>
            </div>
          </Card>
        ) : null}

        {!isHost && !activeMember ? (
          <Card>
            <div className="text-sm font-semibold text-white">Join this group</div>
            <div className="mt-1 text-sm text-white/65">
              {canUseKnownAccountName
                ? `We'll use ${knownAccountName} from your account when you join.`
                : "Enter your name, then continue as guest or sign in to save progress."}
            </div>
            {joinError !== "none" ? (
              <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
                {joinErrorMessage(joinError)}
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              {canUseKnownAccountName ? (
                <>
                  <div className="min-w-[220px] rounded-xl border border-white/12 bg-black/28 px-3 py-2.5 text-sm text-white/85">
                    Joining as {knownAccountName}
                  </div>
                  <Button onClick={continueToRating} disabled={isJoining}>
                    {isJoining ? "Joining..." : "Join and save results"}
                  </Button>
                </>
              ) : (
                <>
                  <Input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    placeholder="Your name"
                    autoComplete="off"
                    className="min-w-[220px]"
                  />
                  <Button
                    onClick={continueAsGuestAndJoin}
                    disabled={isJoining || isStartingGuest || nameDraft.trim().length < 2}
                  >
                    {isJoining || isStartingGuest ? "Joining..." : "Continue as guest"}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setAuthPanelOpen((v) => !v)}
                    disabled={nameDraft.trim().length < 2}
                  >
                    {authPanelOpen ? "Hide sign-in options" : "Sign in to save progress"}
                  </Button>
                </>
              )}
            </div>
            {authPanelOpen ? (
              <div className="mt-3 space-y-3 rounded-xl border border-white/12 bg-black/25 p-3">
                {!isAuthSnapshotReady ? (
                  <Muted>Checking session...</Muted>
                ) : authSnapshot.hasSession && !authSnapshot.isAnonymous ? (
                  <div className="space-y-2">
                    <div className="text-sm text-white/75">
                      Signed in{authSnapshot.email ? ` as ${authSnapshot.email}` : ""}. {knownAccountName ? `We'll use ${knownAccountName} as your name.` : "Join now to save results."}
                    </div>
                    <Button
                      onClick={continueToRating}
                      disabled={isJoining || (!knownAccountName && nameDraft.trim().length < 2)}
                    >
                      {isJoining ? "Joining..." : "Join and save results"}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3 rounded-xl border border-white/12 bg-black/25 p-3">
                      <div className="text-sm font-medium text-white/80">Create an account with email</div>
                      <Input
                        value={authEmail}
                        onChange={(e) => setAuthEmail(e.target.value)}
                        placeholder="Email"
                        autoComplete="email"
                        type="email"
                      />
                      <Button className="w-full" onClick={sendJoinMagicLink} disabled={isSendingMagicLink}>
                        {isSendingMagicLink ? "Sending..." : "Continue with email"}
                      </Button>
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-white/15" />
                        <span className="text-xs uppercase tracking-[0.16em] text-white/55">or</span>
                        <div className="h-px flex-1 bg-white/15" />
                      </div>
                      <Button
                        className="w-full"
                        variant="secondary"
                        onClick={startJoinGoogleSignIn}
                        disabled={isStartingGoogleAuth}
                      >
                        {isStartingGoogleAuth ? "Redirecting..." : "Sign in with Google"}
                      </Button>
                      <Button
                        className="w-full"
                        variant="ghost"
                        onClick={() => router.push(`/signin?next=${encodeURIComponent(`/g/${groupId}`)}`)}
                      >
                        Use email + password
                      </Button>
                    </div>
                  </>
                )}
                {authActionError ? (
                  <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
                    {authActionError}
                  </div>
                ) : null}
              </div>
            ) : null}
          </Card>
        ) : null}

        {isHost || activeMember ? (
          <div className="flex flex-col items-center gap-2">
            <Button
              className="w-auto bg-[rgb(var(--card-2))] px-8 py-3 text-base text-white transition-all duration-200 hover:bg-[rgb(var(--yellow))] hover:text-black active:scale-[0.98]"
              onClick={() => router.push(`/g/${groupId}/rate`)}
            >
              Start rating
            </Button>
            {group.settings.ratingMode !== "shortlist" && isPreparingQueue ? (
              <div className="inline-flex items-center gap-2 text-sm text-white/68">
                <LoadingSpinner className="h-4 w-4" />
                <span>Getting titles ready for rating...</span>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="order-4">
            <CardTitle>Group setup summary</CardTitle>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-white/12 bg-black/28 p-3">
                <div className="text-sm font-semibold">Mode</div>
                <div className="mt-1 text-sm text-white/70">{modeLabel}</div>
              </div>
              <div className="rounded-xl border border-white/12 bg-black/28 p-3">
                <div className="text-sm font-semibold">Content type</div>
                <div className="mt-1 text-sm text-white/70">{contentLabel}</div>
              </div>
              <div className="rounded-xl border border-white/12 bg-black/28 p-3 sm:col-span-2">
                <div className="text-sm font-semibold">Allowed ratings</div>
                <div className="mt-1 text-sm text-white/70">
                  {group.settings.ratingMode === "unlimited" ? ratingLabel(group) : "Custom list mode"}
                </div>
              </div>
              <div className="rounded-xl border border-white/12 bg-black/28 p-3 sm:col-span-2">
                <div className="text-sm font-semibold">Release year range</div>
                <div className="mt-1 text-sm text-white/70">{releaseYearRangeLabel(group)}</div>
              </div>
            </div>
          </Card>

          <Card className="order-1">
            <CardTitle>Members</CardTitle>
            {memberActionError !== "none" ? (
              <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
                {memberActionError === "forbidden"
                  ? "You don’t have permission to remove this member."
                  : "Network error while removing member. Please try again."}
              </div>
            ) : null}
            <div className="mt-3 space-y-2">
              {members.length === 0 ? (
                <Muted>No one has joined yet.</Muted>
              ) : (
                members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/12 bg-black/28 p-3 transition duration-200 hover:border-white/20 hover:bg-black/34"
                  >
                    <div className="text-sm text-white">
                      {member.name}
                      {activeMember?.id === member.id ? <span className="text-white/50"> (you)</span> : null}
                    </div>
                    {isHost && activeMember?.id !== member.id ? (
                      <Button
                        variant="ghost"
                        onClick={() => void removeMember(member)}
                        disabled={isRemovingMemberId === member.id}
                      >
                        {isRemovingMemberId === member.id ? "Removing..." : "Remove"}
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Card>

          {isCustomListMode(group) ? (
            <Card className="order-5">
              <CardTitle>{customListLabel(group.settings.contentType)} preview</CardTitle>
              <div className="mt-3 space-y-1">
                {group.settings.shortlistItems.length === 0 ? (
                  <Muted>No titles added yet.</Muted>
                ) : (
                  group.settings.shortlistItems.slice(0, 8).map((item) => (
                    <div key={item} className="text-sm text-white/80">{item}</div>
                  ))
                )}
                {isHost ? (
                  <div className="pt-2">
                    <Button variant="ghost" onClick={() => router.push(`/g/${groupId}/custom-list`)}>
                      Edit custom list
                    </Button>
                  </div>
                ) : null}
              </div>
            </Card>
          ) : null}

          <Card className="order-3">
            <CardTitle>Stats</CardTitle>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <div className="rounded-xl border border-white/12 bg-black/28 p-3">
                <div className="text-sm font-semibold">Total ratings</div>
                <div className="mt-1 text-sm text-white/70">{stats.totalRatings}</div>
                <div className="mt-1 text-xs text-white/55">Star ratings only</div>
              </div>
              <div className="rounded-xl border border-white/12 bg-black/28 p-3">
                <div className="text-sm font-semibold">Members</div>
                <div className="mt-1 text-sm text-white/70">{members.length}</div>
              </div>
              <div className="rounded-xl border border-white/12 bg-black/28 p-3">
                <div className="text-sm font-semibold">Participation rate</div>
                <div className="mt-1 text-sm text-white/70">{percentText(stats.participationRate)}</div>
                <div className="mt-1 text-xs text-white/55">
                  {stats.participationCount}/{members.length} members rated
                </div>
              </div>
              <div className="rounded-xl border border-white/12 bg-black/28 p-3">
                <div className="text-sm font-semibold">Avg ratings/member</div>
                <div className="mt-1 text-sm text-white/70">{stats.avgRatingsPerMember.toFixed(2)}</div>
              </div>
              <div className="rounded-xl border border-white/12 bg-black/28 p-3">
                <div className="text-sm font-semibold">Skip rate</div>
                <div className="mt-1 text-sm text-white/70">{percentText(stats.skipRate)}</div>
                <div className="mt-1 text-xs text-white/55">
                  {stats.skipCount}/{stats.totalSubmitted} submissions
                </div>
              </div>
            </div>
          </Card>

          <Card className="order-2">
            <CardTitle>Results preview</CardTitle>
            <div className="mt-3 space-y-2">
              {topThree.length === 0 ? (
                <Muted>No ranked titles yet. Start rating to see results.</Muted>
              ) : (
                topThree.map((row, index) => (
                  <div
                    key={row.titleId}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/12 bg-black/28 p-3 transition duration-200 hover:border-white/20 hover:bg-black/34"
                  >
                    {(() => {
                      const resolved = resolvePreviewTitle(group, row.titleId, titleCache, shortlistFallback);
                      const posterUrl = resolved.posterPath
                        ? `https://image.tmdb.org/t/p/w92${resolved.posterPath}`
                        : null;
                      return (
                        <>
                          <div className="flex min-w-0 items-start gap-2">
                            <PosterImage src={posterUrl} alt={resolved.title} className="w-10 shrink-0" />
                            <div className="min-w-0">
                              <a
                                href={resolved.infoUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="block truncate text-sm font-semibold text-white hover:underline"
                              >
                                {index + 1}. {resolved.title}
                              </a>
                              <div className="mt-1 flex items-center gap-2 text-xs text-white/65">
                                <span>{resolved.year ?? "Unknown year"}</span>
                                <Pill>{resolved.mediaType === "movie" ? "Movie" : "Show"}</Pill>
                              </div>
                            </div>
                          </div>
                          <div className="text-right text-xs text-white/70">
                            <div className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--yellow))]/35 bg-[rgb(var(--yellow))]/12 px-2 py-0.5 text-base font-bold text-white">
                              <span>{row.totalStars}</span>
                              <span className="text-[rgb(var(--yellow))]">{"\u2605"}</span>
                            </div>
                            <div className="mt-1">
                              <div>{starsText(row.avg)} avg</div>
                              <div>{row.votes} rated</div>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ))
              )}
              <div className="pt-2">
                <Button variant="secondary" onClick={() => router.push(`/g/${groupId}/results`)}>
                  Open results
                </Button>
              </div>
            </div>
          </Card>

        </div>
      </div>
    </AppShell>
  );
}


