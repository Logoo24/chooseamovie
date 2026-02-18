"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button, Card, CardTitle, Input, Muted, Pill } from "@/components/ui";
import { useToast } from "@/components/useToast";
import { ensureMember } from "@/lib/memberStore";
import { setRating as setRatingValue } from "@/lib/ratingStore";
import { loadGroup, type Group } from "@/lib/storage";
import { TITLES, titleSearchUrl, type Title } from "@/lib/titles";
import {
  countRated,
  getActiveMember,
  loadRatings,
  passesGroupFilters,
  setActiveMember,
  type Member,
  type RatingValue,
} from "@/lib/ratings";

function makeShortlistTitles(items: string[]): Title[] {
  return items.map((name, idx) => ({
    id: `sl:${idx}:${name.toLowerCase().replace(/\s+/g, "-").slice(0, 40)}`,
    name,
    type: "movie",
    mpaa: undefined,
    genres: ["Shortlist"],
  }));
}

function Stars({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: 1 | 2 | 3 | 4 | 5) => void;
}) {
  const [popAt, setPopAt] = useState<number | null>(null);

  function choose(n: 1 | 2 | 3 | 4 | 5) {
    onChange(n);
    setPopAt(n);
    window.setTimeout(() => setPopAt(null), 160);
  }

  return (
    <div className="flex items-center justify-center gap-2">
      {[1, 2, 3, 4, 5].map((n) => {
        const active = n <= value;
        return (
          <button
            key={n}
            type="button"
            onClick={() => choose(n as 1 | 2 | 3 | 4 | 5)}
            className={[
              "relative rounded-full border px-3 py-2 text-sm font-semibold transition",
              "duration-150 ease-out",
              active
                ? "border-[rgb(var(--yellow))]/55 bg-[rgb(var(--yellow))]/18 text-white shadow-[0_0_18px_rgba(255,204,51,0.18)]"
                : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
              n === popAt ? "cam-star-pop" : "",
            ].join(" ")}
            aria-label={`${n} stars`}
          >
            <span
              className={[
                "inline-block transition-transform duration-150",
                active ? "scale-[1.02]" : "scale-100",
              ].join(" ")}
            >
              ★
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PosterCard({ title }: { title: Title }) {
  const genre = title.genres[0] ?? "Movie Night";
  const badge = title.type === "movie" ? "Movie" : "Show";

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[rgb(var(--card))]">
      <div className="absolute inset-0 opacity-40">
        <div className="h-full w-full bg-gradient-to-br from-[rgb(var(--red))]/25 via-white/5 to-[rgb(var(--yellow))]/15" />
      </div>

      <div className="relative p-4">
        <div className="flex items-center justify-between gap-2">
          <Pill>{badge}</Pill>
          {title.mpaa ? <Pill>{title.mpaa}</Pill> : <Pill>NR</Pill>}
        </div>

        <div className="mt-4">
          <div className="text-xl font-semibold tracking-tight">{title.name}</div>
          <div className="mt-1 text-sm text-white/65">
            {title.year ? title.year : " "} {title.year ? "• " : ""}{genre}
            {title.runtimeMins ? ` • ${title.runtimeMins} min` : ""}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={titleSearchUrl(title)}
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

  const [member, setMember] = useState<Member | null>(null);
  const [nameDraft, setNameDraft] = useState("");

  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentStars, setCurrentStars] = useState(0);

  const [ratedCount, setRatedCount] = useState(0);
  const [unratedTitles, setUnratedTitles] = useState<Title[]>([]);

  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    const g = loadGroup(groupId);
    setGroup(g);

    const active = getActiveMember(groupId);
    if (active) {
      setMember(active);
      setNameDraft(active.name);
    }
  }, [groupId]);

  const inviteLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/g/${groupId}`;
  }, [groupId]);

  // Build the queue based on mode + filters + unrated
  useEffect(() => {
    if (!group || !member) return;

    const ratings = loadRatings(groupId, member.id);
    setRatedCount(countRated(ratings));

    let catalog: Title[] = [];

    if (group.settings.ratingMode === "shortlist") {
      catalog = makeShortlistTitles(group.settings.shortlistItems || []);
    } else {
      catalog = TITLES.filter((t) => passesGroupFilters(group, t));
    }

    const unrated = catalog.filter((t) => ratings[t.id] === undefined);
    setUnratedTitles(unrated);
    setCurrentIndex(0);
    setCurrentStars(0);
  }, [group, member, groupId]);

  const currentTitle = unratedTitles[currentIndex] ?? null;

  const progressLabel = useMemo(() => {
    const total = unratedTitles.length;
    if (!member) return "";
    return total === 0 ? "All caught up" : `${currentIndex + 1} of ${total}`;
  }, [unratedTitles.length, currentIndex, member]);

  async function confirmName() {
    const trimmed = nameDraft.trim();
    if (trimmed.length < 2) {
      show("Name must be at least 2 characters");
      return;
    }

    const m = await ensureMember(groupId, trimmed);
    setActiveMember(groupId, m);
    setMember(m);
    show(`You are in as ${m.name}`);
  }

  function advance() {
    setCurrentStars(0);
    setCurrentIndex((i) => Math.min(i + 1, unratedTitles.length));
  }

  function rate(value: RatingValue) {
    if (!member || !currentTitle) return;
    void setRatingValue(groupId, member.id, currentTitle.id, value);
    setRatedCount((c) => c + 1);
    advance();
  }

  if (!group) {
    return (
      <AppShell>
        <Card>
          <CardTitle>Group not found</CardTitle>
          <div className="mt-2">
            <Muted>This group does not exist on this device yet.</Muted>
          </div>
          <div className="mt-4">
            <a href="/create">
              <Button>Create a group</Button>
            </a>
          </div>
        </Card>
      </AppShell>
    );
  }

  // Step 1: choose a name
  if (!member) {
    return (
      <AppShell>
        {Toast}
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Join to rate</h1>
              <div className="mt-1 text-sm text-white/60">{group.name}</div>
            </div>
            <Pill>{group.settings.ratingMode === "shortlist" ? "Shortlist" : "Unlimited"}</Pill>
          </div>

          <Card>
            <CardTitle>Your name</CardTitle>
            <div className="mt-3 space-y-2">
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                placeholder="Your name"
                autoComplete="off"
              />
              <Muted>This name will show in results (on this device for now).</Muted>
              <div className="mt-3 flex gap-2">
                <Button onClick={confirmName}>Continue</Button>
                <Button variant="ghost" onClick={() => router.push(`/g/${groupId}`)}>
                  Back
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
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">Rate</h1>
            <div className="mt-1 text-sm text-white/60">
              {group.name} • {member.name}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Pill>{group.settings.ratingMode === "shortlist" ? "Shortlist" : "Unlimited"}</Pill>
            <Pill>{progressLabel}</Pill>
            <Pill>{ratedCount} rated</Pill>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setShowInvite((v) => !v)}>
            Invite
          </Button>
          <Button variant="ghost" onClick={() => router.push(`/g/${groupId}`)}>
            Lobby
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
              <Muted>
                Cross-device joining will work after we add a database. For now, this is mainly for organizing your flow.
              </Muted>
            </div>
          </Card>
        ) : null}

        {currentTitle ? (
          <div className="space-y-4">
            <PosterCard title={currentTitle} />

            <Card>
              <CardTitle>How interested are you?</CardTitle>
              <div className="mt-3 space-y-3">
                <Stars value={currentStars} onChange={(v) => setCurrentStars(v)} />

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    onClick={() => {
                      if (currentStars === 0) {
                        show("Pick stars first, or skip");
                        return;
                      }
                      rate(currentStars as RatingValue);
                      show("Saved");
                    }}
                  >
                    Save rating
                  </Button>

                  <Button
                    variant="secondary"
                    onClick={() => {
                      rate(0);
                      show("Skipped");
                    }}
                  >
                    Skip
                  </Button>
                </div>

                <Muted>
                  Tip: Use Skip when you do not know the title, or do not care.
                </Muted>
              </div>
            </Card>
          </div>
        ) : (
          <Card>
            <CardTitle>You are caught up</CardTitle>
            <div className="mt-2">
              <Muted>
                You have rated everything available under the current mode.
              </Muted>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => router.push(`/g/${groupId}/results`)}>View results</Button>
              <Button variant="secondary" onClick={() => router.push(`/g/${groupId}`)}>
                Lobby
              </Button>
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
