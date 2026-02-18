"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { StorageModeBanner } from "@/components/StorageModeBanner";
import { Button, Card, CardTitle, Input, Muted, Pill } from "@/components/ui";
import { useStorageStatus } from "@/components/useStorageStatus";
import { useToast } from "@/components/useToast";
import { getGroup } from "@/lib/groupStore";
import { isHostForGroup } from "@/lib/hostStore";
import { joinGroupMember } from "@/lib/memberStore";
import { setActiveMember } from "@/lib/ratings";
import { getCurrentUserId } from "@/lib/supabase";
import { type Group } from "@/lib/storage";

function ratingLabel(group: Group) {
  const allowed: string[] = [];
  if (group.settings.allowG) allowed.push("G");
  if (group.settings.allowPG) allowed.push("PG");
  if (group.settings.allowPG13) allowed.push("PG-13");
  if (group.settings.allowR) allowed.push("R");
  return allowed.join(", ");
}

export default function GroupLobbyPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const joinCode = searchParams.get("code") ?? "";

  const [group, setGroup] = useState<Group | null>(null);
  const [isLoadingGroup, setIsLoadingGroup] = useState(true);
  const [isHost, setIsHost] = useState(false);
  const [loadError, setLoadError] = useState<"none" | "not_found" | "invalid_code" | "auth_failed">(
    "none"
  );
  const [nameDraft, setNameDraft] = useState("");
  const [isContinuing, setIsContinuing] = useState(false);
  const { mode } = useStorageStatus();
  const { show, Toast } = useToast();

  useEffect(() => {
    let alive = true;
    setIsLoadingGroup(true);
    setLoadError("none");

    (async () => {
      const uid = await getCurrentUserId();
      const loaded = await getGroup(groupId, joinCode || undefined);
      if (!alive) return;
      setGroup(loaded.group);
      setLoadError(loaded.error);
      const hostFromOwner = Boolean(
        loaded.group?.ownerUserId && uid && loaded.group.ownerUserId === uid
      );
      const hostFromLocalFlag = !loaded.group?.ownerUserId && isHostForGroup(groupId);
      setIsHost(hostFromOwner || hostFromLocalFlag);
      setIsLoadingGroup(false);
    })();

    return () => {
      alive = false;
    };
  }, [groupId, joinCode]);

  const inviteLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    const base = `${window.location.origin}/g/${groupId}`;
    if (!group?.joinCode) return base;
    return `${base}?code=${group.joinCode}`;
  }, [groupId, group?.joinCode]);

  const inviteHelperText =
    mode === "offline"
      ? "Offline mode: invite links only work on this device right now."
      : mode === "online"
        ? "Invite friends to open this link and rate from their devices."
        : "Checking online status...";

  async function continueToRating() {
    const trimmed = nameDraft.trim();
    if (trimmed.length < 2) {
      show("Name must be at least 2 characters");
      return;
    }
    if (!joinCode) {
      show("Ask the host for the invite link");
      return;
    }

    setIsContinuing(true);
    try {
      const joined = await joinGroupMember(groupId, trimmed, joinCode);
      if (!joined.member) {
        if (joined.error === "invalid_code") show("Invalid join code");
        else if (joined.error === "auth_failed") show("Authentication failed. Reload and try again.");
        else show("Could not join group. Please try again.");
        return;
      }
      const member = joined.member;
      setActiveMember(groupId, member);
      router.push(`/g/${groupId}/rate`);
    } finally {
      setIsContinuing(false);
    }
  }

  if (isLoadingGroup) {
    return (
      <AppShell>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Loading group</h1>
            <Pill>Please wait</Pill>
          </div>
          <Card>
            <CardTitle>Getting things ready</CardTitle>
            <div className="mt-3 space-y-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-white/10" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
            </div>
          </Card>
        </div>
      </AppShell>
    );
  }

  if (!group) {
    if (!joinCode && !isHost) {
      return (
        <AppShell>
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Invite code required</h1>
              <Pill>Ask host</Pill>
            </div>
            <Card>
              <CardTitle>Ask the host for the invite link</CardTitle>
              <div className="mt-2">
                <Muted>
                  To join this group, use the full invite link that includes a secure join code.
                </Muted>
              </div>
              <div className="mt-4">
                <a href="/create">
                  <Button variant="secondary">Create your own group</Button>
                </a>
              </div>
            </Card>
          </div>
        </AppShell>
      );
    }

    const title =
      loadError === "invalid_code"
        ? "Invalid invite link"
        : loadError === "auth_failed"
          ? "Authentication required"
          : "Group not found";
    const desc =
      loadError === "invalid_code"
        ? "This invite code is invalid. Ask the host to resend the full link."
        : loadError === "auth_failed"
          ? "We could not establish an anonymous session. Refresh and try again."
          : "The invite may be expired, mistyped, or created in offline mode on another device.";

    return (
      <AppShell>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <Pill>Check link</Pill>
          </div>
          <Card>
            <CardTitle>We could not find that group</CardTitle>
            <div className="mt-2">
              <Muted>{desc}</Muted>
            </div>
            <div className="mt-4">
              <a href="/create">
                <Button>Create a group</Button>
              </a>
            </div>
          </Card>
        </div>
      </AppShell>
    );
  }

  const modeLabel = group.settings.ratingMode === "shortlist" ? "Shortlist" : "Unlimited";
  const contentLabel = group.settings.contentType === "movies" ? "Movies" : "Movies + Shows";
  const shortlistSummary = group.settings.shortlistItems.length
    ? `${group.settings.shortlistItems.slice(0, 3).join(", ")}${group.settings.shortlistItems.length > 3 ? "..." : ""}`
    : "No titles set.";

  if (!isHost) {
    return (
      <AppShell>
        {Toast}
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Welcome to {group.name}</h1>
              <div className="mt-1 text-sm text-white/60">
                ChooseAMovie helps your group rate titles quickly and find the best match.
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Pill>{contentLabel}</Pill>
              <Pill>{modeLabel}</Pill>
            </div>
          </div>

          <StorageModeBanner />

          <Card>
            <CardTitle>Group rules</CardTitle>
            <div className="mt-3 space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3">
                  <div className="text-sm font-semibold">Content type</div>
                  <div className="mt-1 text-sm text-white/65">{contentLabel}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3">
                  <div className="text-sm font-semibold">Allowed ratings</div>
                  <div className="mt-1 text-sm text-white/65">{ratingLabel(group)}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3 sm:col-span-2">
                  <div className="text-sm font-semibold">Rating mode</div>
                  <div className="mt-1 text-sm text-white/65">{modeLabel}</div>
                  {group.settings.ratingMode === "shortlist" ? (
                    <div className="mt-1 text-sm text-white/60">Shortlist: {shortlistSummary}</div>
                  ) : null}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardTitle>Join and start rating</CardTitle>
            <div className="mt-3 space-y-3">
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Your name"
                autoComplete="off"
              />
              <Muted>Your name appears in group results for this device.</Muted>
              <div className="flex flex-wrap gap-2">
                <Button onClick={continueToRating} disabled={isContinuing}>
                  {isContinuing ? "Starting..." : "Start rating"}
                </Button>
                <Button variant="ghost" onClick={() => router.push(`/g/${groupId}/results`)}>
                  View results
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {Toast}
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{group.name}</h1>
            <div className="mt-1 text-sm text-white/60">Lobby</div>
          </div>
          <div className="flex items-center gap-2">
            <Pill>{contentLabel}</Pill>
            <Pill>{modeLabel}</Pill>
          </div>
        </div>

        <StorageModeBanner />

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
                    } catch {}
                  } else {
                    await navigator.clipboard.writeText(inviteLink);
                    show("Copied (share not supported)");
                  }
                }}
              >
                Share
              </Button>
            </div>

            <Muted>
              {inviteHelperText}
            </Muted>
          </div>
        </Card>

        <Card>
          <CardTitle>Settings</CardTitle>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3">
              <div className="text-sm font-semibold">Content</div>
              <div className="mt-1 text-sm text-white/60">
                {group.settings.contentType === "movies" ? "Movies only" : "Movies and shows"}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3">
              <div className="text-sm font-semibold">Allowed ratings</div>
              <div className="mt-1 text-sm text-white/60">{ratingLabel(group)}</div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3 sm:col-span-2">
              <div className="text-sm font-semibold">Mode</div>
              <div className="mt-1 text-sm text-white/60">{modeLabel}</div>
              {group.settings.ratingMode === "shortlist" ? (
                <div className="mt-2 text-sm text-white/70">
                  {group.settings.shortlistItems.length
                    ? `Titles: ${group.settings.shortlistItems.join(", ")}`
                    : "No titles set."}
                </div>
              ) : null}
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>Start</CardTitle>
          <div className="mt-2">
            <Muted>Rate a few titles, then check results.</Muted>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={`/g/${groupId}/rate`}>
              <Button>Start rating</Button>
            </a>
            <a href={`/g/${groupId}/results`}>
              <Button variant="secondary">View results</Button>
            </a>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
