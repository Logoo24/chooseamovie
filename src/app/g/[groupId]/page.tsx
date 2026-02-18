"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { GroupTabs } from "@/components/GroupTabs";
import { PosterImage } from "@/components/PosterImage";
import { StateCard } from "@/components/StateCard";
import { Button, Card, CardTitle, Input, Muted, Pill } from "@/components/ui";
import { customListLabel, isCustomListMode, ratingModeLabel } from "@/lib/groupLabels";
import { getGroup } from "@/lib/groupStore";
import { isHostForGroup } from "@/lib/hostStore";
import { joinGroupMember, listGroupMembers, removeGroupMember } from "@/lib/memberStore";
import { getGroupRatings, type GroupRatingsResult } from "@/lib/ratingStore";
import { getActiveMember, setActiveMember, type Member } from "@/lib/ratings";
import { getShortlist, type ShortlistItem, type ShortlistSnapshot } from "@/lib/shortlistStore";
import { ensureAnonymousSession, getCurrentUserId } from "@/lib/supabase";
import { getTitleSnapshots, type TitleSnapshot, upsertTitleSnapshot } from "@/lib/titleCacheStore";
import { parseTmdbTitleKey } from "@/lib/tmdbTitleKey";
import { getGroupTopTitles, type GroupTopTitle } from "@/lib/topTitlesStore";
import { TITLES, titleSearchUrl } from "@/lib/titles";
import { type Group } from "@/lib/storage";

function ratingLabel(group: Group) {
  const allowed: string[] = [];
  if (group.settings.allowG) allowed.push("G");
  if (group.settings.allowPG) allowed.push("PG");
  if (group.settings.allowPG13) allowed.push("PG-13");
  if (group.settings.allowR) allowed.push("R");
  return allowed.join(", ");
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

function resolvePreviewTitle(
  group: Group,
  titleId: string,
  titleCache: Record<string, TitleSnapshot>,
  shortlistFallback: Record<string, ShortlistSnapshot>
): PreviewResolved {
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

  const match = TITLES.find((item) => item.id === titleId);
  if (match) {
    return {
      title: match.name,
      year: match.year ? String(match.year) : null,
      mediaType: match.type === "movie" ? "movie" : "tv",
      posterPath: null,
      infoUrl: titleSearchUrl(match),
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

function starsText(avg: number) {
  return avg ? avg.toFixed(2) : "-";
}

export default function GroupHubPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const joinCode = searchParams.get("code") ?? "";

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
  const [isRemovingMemberId, setIsRemovingMemberId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setIsLoadingGroup(true);
    setLoadError("none");
    setAuthBlocked(false);

    (async () => {
      const anonUserId = await ensureAnonymousSession();
      if (!alive) return;
      if (!anonUserId) {
        setAuthBlocked(true);
        setIsLoadingGroup(false);
        return;
      }

      const uid = await getCurrentUserId();
      const loaded = await getGroup(groupId, joinCode || undefined);
      if (!alive) return;

      setGroup(loaded.group);
      setLoadError(loaded.error);

      const hostFromOwner = Boolean(
        loaded.group?.ownerUserId && uid && loaded.group.ownerUserId === uid
      );
      const hostFromLocalFlag = !loaded.group?.ownerUserId && isHostForGroup(groupId);
      const host = hostFromOwner || hostFromLocalFlag;
      setIsHost(host);

      const active = getActiveMember(groupId);
      setActiveMemberState(active);
      if (active) setNameDraft(active.name);

      setIsLoadingGroup(false);
    })();

    return () => {
      alive = false;
    };
  }, [groupId, joinCode, authRetryKey]);

  useEffect(() => {
    if (!group || authBlocked) return;
    let alive = true;
    let intervalId: number | null = null;

    (async () => {
      const fetch = async () => {
        const [memberRes, ratingRes, topRes] = await Promise.all([
          listGroupMembers(groupId),
          getGroupRatings(groupId),
          getGroupTopTitles(groupId),
        ]);

        if (!alive) return;
        setMembers(memberRes.members);
        setRatings(ratingRes);
        setTopRows((current) => {
          if (topRes.rows.length === 0 && current.length > 0) return current;
          return topRes.rows;
        });
      };

      await fetch();
      intervalId = window.setInterval(() => {
        void fetch();
      }, 3000);
    })();

    return () => {
      alive = false;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [group, groupId, authBlocked]);

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

  const inviteLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    const base = `${window.location.origin}/g/${groupId}`;
    if (!group?.joinCode) return base;
    return `${base}?code=${group.joinCode}`;
  }, [groupId, group?.joinCode]);

  const shouldHideInviteLink = Boolean(
    group && !isHost && activeMember && !group.settings.allow_members_invite_link
  );

  const totalRatings = useMemo(() => {
    if (!ratings) return 0;
    return Object.values(ratings.perMember).reduce((total, perMember) => {
      return total + Object.keys(perMember).length;
    }, 0);
  }, [ratings]);

  const topThree = useMemo(() => {
    return topRows.slice(0, 3);
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

  useEffect(() => {
    if (!group) return;
    for (const row of topThree) {
      if (titleCache[row.titleId]) continue;
      const resolved = resolvePreviewTitle(group, row.titleId, titleCache, shortlistFallback);
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
  }, [group, topThree, titleCache, shortlistFallback]);

  async function continueToRating() {
    const trimmed = nameDraft.trim();
    if (trimmed.length < 2) return;
    if (!joinCode) return;

    setIsJoining(true);
    try {
      const joined = await joinGroupMember(groupId, trimmed, joinCode);
      if (!joined.member) return;

      setActiveMember(groupId, joined.member);
      setActiveMemberState(joined.member);
      router.push(`/g/${groupId}/rate`);
    } finally {
      setIsJoining(false);
    }
  }

  async function removeMember(member: Member) {
    if (!isHost) return;
    if (!window.confirm(`Remove ${member.name} from this group?`)) return;

    setIsRemovingMemberId(member.id);
    try {
      await removeGroupMember(groupId, member.id);
      const refreshed = await listGroupMembers(groupId);
      setMembers(refreshed.members);
    } finally {
      setIsRemovingMemberId(null);
    }
  }

  if (isLoadingGroup) {
    return (
      <AppShell>
        <StateCard
          title="Loading group home"
          badge="Please wait"
          description="Getting your group details ready."
        />
      </AppShell>
    );
  }

  if (!group) {
    if (!joinCode && !isHost) {
      return (
        <AppShell>
          <StateCard
            title="Invite code required"
            badge="Ask host"
            description="Use the full invite link from the host to open this group home."
            actionHref="/create"
            actionLabel="Create your own group"
            actionVariant="secondary"
          />
        </AppShell>
      );
    }

    const title =
      loadError === "invalid_code"
        ? "Invalid invite link"
        : loadError === "network"
          ? "Network error"
          : loadError === "auth_failed"
            ? "Authentication required"
            : "Group not found";

    return (
      <AppShell>
        <StateCard
          title={title}
          badge="Check link"
          description="Open a valid invite link or create a new group."
          actionHref="/create"
          actionLabel="Create a group"
        />
      </AppShell>
    );
  }

  if (!isHost && !joinCode) {
    return (
      <AppShell>
        <StateCard
          title="Invite code required"
          badge="Ask host"
          description="Open the full invite link from the host to join this group."
          actionHref="/create"
          actionLabel="Create your own group"
          actionVariant="secondary"
        />
      </AppShell>
    );
  }

  const modeLabel = ratingModeLabel(group.settings);
  const contentLabel = group.settings.contentType === "movies" ? "Movies" : "Movies + Shows";

  return (
    <AppShell>
      <div className="space-y-6">
        <GroupTabs groupId={groupId} />

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{group.name} ChooseAMovie Home</h1>
              <div className="mt-1 text-sm text-white/60">
                Share this invite so everyone can join your group and rate together.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Pill>{contentLabel}</Pill>
              <Pill>{modeLabel}</Pill>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {shouldHideInviteLink ? (
              <div className="rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3 text-sm text-white/75">
                Only hosts can share invites in this group.
              </div>
            ) : (
              <div className="rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3 text-sm text-white/90 break-all">
                {inviteLink}
              </div>
            )}

            <Muted>
              {shouldHideInviteLink
                ? "Ask the host if someone new needs to join."
                : "Copy and send this link. New members should open the exact URL with the code."}
            </Muted>

            {!shouldHideInviteLink ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={async () => {
                    await navigator.clipboard.writeText(inviteLink);
                  }}
                >
                  Copy invite link
                </Button>
                <Button variant="secondary" onClick={() => router.push(`/g/${groupId}/results`)}>
                  Results
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => router.push(`/g/${groupId}/results`)}>
                  Results
                </Button>
              </div>
            )}

            {!isHost && !activeMember ? (
              <div className="rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3">
                <div className="text-sm font-semibold text-white">Join to participate</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    placeholder="Your name"
                    autoComplete="off"
                    className="min-w-[220px]"
                  />
                  <Button onClick={continueToRating} disabled={isJoining || nameDraft.trim().length < 2}>
                    {isJoining ? "Joining..." : "Join and rate"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </Card>

        {isHost || activeMember ? (
          <div className="flex justify-center">
            <Button
              className="w-auto bg-[rgb(var(--card-2))] px-8 py-3 text-base text-white transition-all duration-200 hover:bg-[rgb(var(--yellow))] hover:text-black active:scale-[0.98]"
              onClick={() => router.push(`/g/${groupId}/rate`)}
            >
              Start rating
            </Button>
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardTitle>Group setup summary</CardTitle>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3">
                <div className="text-sm font-semibold">Mode</div>
                <div className="mt-1 text-sm text-white/70">{modeLabel}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3">
                <div className="text-sm font-semibold">Content type</div>
                <div className="mt-1 text-sm text-white/70">{contentLabel}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3 sm:col-span-2">
                <div className="text-sm font-semibold">Allowed ratings</div>
                <div className="mt-1 text-sm text-white/70">
                  {group.settings.ratingMode === "unlimited" ? ratingLabel(group) : "Custom list mode"}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardTitle>Members</CardTitle>
            <div className="mt-3 space-y-2">
              {members.length === 0 ? (
                <Muted>No members yet.</Muted>
              ) : (
                members.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3"
                  >
                    <div className="text-sm text-white">
                      {member.name}
                      {activeMember?.id === member.id ? <span className="text-white/50"> (you)</span> : null}
                    </div>
                    {isHost ? (
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
            <Card>
              <CardTitle>{customListLabel(group.settings.contentType)} preview</CardTitle>
              <div className="mt-3 space-y-1">
                {group.settings.shortlistItems.length === 0 ? (
                  <Muted>No items yet.</Muted>
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

          <Card>
            <CardTitle>Stats</CardTitle>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3">
                <div className="text-sm font-semibold">Total ratings</div>
                <div className="mt-1 text-sm text-white/70">{totalRatings}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3">
                <div className="text-sm font-semibold">Members</div>
                <div className="mt-1 text-sm text-white/70">{members.length}</div>
              </div>
            </div>
          </Card>

          <Card>
            <CardTitle>Results preview</CardTitle>
            <div className="mt-3 space-y-2">
              {topThree.length === 0 ? (
                <Muted>No ranked titles yet. Start rating to see results.</Muted>
              ) : (
                topThree.map((row, index) => (
                  <div
                    key={row.titleId}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3"
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
                            <div>{starsText(row.avg)} avg</div>
                            <div>{row.votes} rated</div>
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

          <div className="pt-1 xl:col-span-2">
            <a href="/create">
              <Button variant="secondary" className="w-full sm:w-auto">
                Create new group
              </Button>
            </a>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

