"use client";

import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button, Card, CardTitle, Input, Muted } from "@/components/ui";
import { getAuthSnapshot, subscribeAuthSnapshot, type AuthSnapshot } from "@/lib/authClient";
import { createGroup } from "@/lib/groupStore";
import { markHostForGroup } from "@/lib/hostStore";
import { getHostDisplayName, setHostDisplayName } from "@/lib/hostProfileStore";
import { createGroupId, getEndlessSettings, type GroupSettings } from "@/lib/storage";
import { isSupabaseConfigured } from "@/lib/supabase";

type Step = 0 | 1 | 2;

type GenreOption = {
  id: number;
  name: string;
};

type GenreListResponse = {
  genres?: GenreOption[];
  error?: { message?: string };
};

const YEAR_PATTERN = /^\d{4}$/;
const DATE_RANGE_DEFAULT_FROM_YEAR = 2000;

function extractYear(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  const match = /^(\d{4})/.exec(trimmed);
  return match ? match[1] : null;
}

function toYearBoundaryDate(yearValue: string, boundary: "start" | "end"): string | null {
  const trimmed = yearValue.trim();
  if (!YEAR_PATTERN.test(trimmed)) return null;
  return boundary === "start" ? `${trimmed}-01-01` : `${trimmed}-12-31`;
}

export default function CreateGroupPage() {
  const router = useRouter();
  const [auth, setAuth] = useState<AuthSnapshot>({
    userId: null,
    email: null,
    provider: null,
    hasSession: false,
    isAnonymous: false,
  });
  const [isAuthReady, setIsAuthReady] = useState(false);
  const hasSupabaseAuth = isSupabaseConfigured();

  const placeholders = useMemo(
    () => ["Movie night", "Family movie night", "What should we watch?", "Roommates"],
    []
  );
  const [phIndex, setPhIndex] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => {
      setPhIndex((i) => (i + 1) % placeholders.length);
    }, 2000);
    return () => window.clearInterval(t);
  }, [placeholders.length]);

  const [step, setStep] = useState<Step>(0);
  const [hostName, setHostName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [settings, setSettings] = useState<GroupSettings>({
    contentType: "movies",
    allowG: true,
    allowPG: true,
    allowPG13: true,
    allowR: true,
    allowTVY: true,
    allowTVY7: true,
    allowTVG: true,
    allowTVPG: true,
    allowTV14: true,
    allowTVMA: true,
    allow_members_invite_link: false,
    top_titles_limit: 100,
    ratingMode: "unlimited",
    shortlistItems: [],
    endless: getEndlessSettings(undefined),
  });
  const [isCreating, setIsCreating] = useState(false);
  const [genreOptions, setGenreOptions] = useState<GenreOption[]>([]);
  const [isLoadingGenres, setIsLoadingGenres] = useState(false);
  const [genreLoadError, setGenreLoadError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const movieRatingOptions: Array<{
    key: "allowG" | "allowPG" | "allowPG13" | "allowR";
    label: string;
    desc: string;
  }> = [
    { key: "allowG", label: "G", desc: "General audiences" },
    { key: "allowPG", label: "PG", desc: "Parental guidance" },
    { key: "allowPG13", label: "PG-13", desc: "Teens and up" },
    { key: "allowR", label: "R", desc: "Restricted" },
  ];

  const tvRatingOptions: Array<{
    key: "allowTVY" | "allowTVY7" | "allowTVG" | "allowTVPG" | "allowTV14" | "allowTVMA";
    label: string;
    desc: string;
  }> = [
    { key: "allowTVY", label: "TV-Y", desc: "All children" },
    { key: "allowTVY7", label: "TV-Y7", desc: "Directed to older children" },
    { key: "allowTVG", label: "TV-G", desc: "General audience" },
    { key: "allowTVPG", label: "TV-PG", desc: "Parental guidance suggested" },
    { key: "allowTV14", label: "TV-14", desc: "Parents strongly cautioned" },
    { key: "allowTVMA", label: "TV-MA", desc: "Mature audience only" },
  ];

  useEffect(() => {
    setHostName(getHostDisplayName());
  }, []);

  useEffect(() => {
    let alive = true;
    void getAuthSnapshot().then((snapshot) => {
      if (!alive) return;
      setAuth(snapshot);
      setIsAuthReady(true);
    });

    const unsubscribe = subscribeAuthSnapshot((snapshot) => {
      setAuth(snapshot);
      setIsAuthReady(true);
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setIsLoadingGenres(true);
    setGenreLoadError(null);

    (async () => {
      try {
        const [movieResponse, tvResponse] = await Promise.all([
          fetch("/api/tmdb/genres?type=movie"),
          fetch("/api/tmdb/genres?type=tv"),
        ]);
        const [movieBody, tvBody] = (await Promise.all([
          movieResponse.json(),
          tvResponse.json(),
        ])) as [GenreListResponse, GenreListResponse];
        if (!alive) return;

        if (!movieResponse.ok && !tvResponse.ok) {
          setGenreOptions([]);
          setGenreLoadError(movieBody.error?.message ?? tvBody.error?.message ?? "Could not load genres right now.");
          return;
        }

        const merged = new Map<number, string>();
        const mergeGenres = (body: GenreListResponse) => {
          const list = Array.isArray(body.genres) ? body.genres : [];
          for (const genre of list) {
            if (!Number.isInteger(genre.id) || typeof genre.name !== "string") continue;
            const trimmed = genre.name.trim();
            if (!trimmed) continue;
            if (!merged.has(genre.id)) {
              merged.set(genre.id, trimmed);
            }
          }
        };

        if (movieResponse.ok) mergeGenres(movieBody);
        if (tvResponse.ok) mergeGenres(tvBody);

        setGenreOptions(
          Array.from(merged.entries())
            .map(([id, name]) => ({ id, name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      } catch {
        if (!alive) return;
        setGenreOptions([]);
        setGenreLoadError("Could not load genres right now.");
      } finally {
        if (alive) setIsLoadingGenres(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const isCustomListMode = settings.ratingMode === "shortlist";
  const atLeastOneMovieRating =
    settings.allowG || settings.allowPG || settings.allowPG13 || settings.allowR;
  const atLeastOneTvRating =
    settings.allowTVY ||
    settings.allowTVY7 ||
    settings.allowTVG ||
    settings.allowTVPG ||
    settings.allowTV14 ||
    settings.allowTVMA;
  const requiresTvRatings = settings.contentType === "movies_and_shows";
  const hasAtLeastOneAllowedRating = requiresTvRatings
    ? atLeastOneMovieRating || atLeastOneTvRating
    : atLeastOneMovieRating;
  const currentYear = new Date().getFullYear();
  const hasReleaseYearRange = Boolean(settings.endless.releaseFrom || settings.endless.releaseTo);
  const releaseFromYear = extractYear(settings.endless.releaseFrom) ?? String(DATE_RANGE_DEFAULT_FROM_YEAR);
  const releaseToYear = extractYear(settings.endless.releaseTo) ?? String(currentYear);

  const canGoStep2 = hostName.trim().length >= 2;
  const canGoStep3 = groupName.trim().length >= 2;
  const hasSignedInHost = auth.hasSession && !auth.isAnonymous;
  const canCreateWithSettings = isCustomListMode ? true : hasAtLeastOneAllowedRating;
  const canCreate = canCreateWithSettings && (!hasSupabaseAuth || hasSignedInHost);
  const stepInsetClass = step === 0 ? "sm:pr-2" : step === 1 ? "sm:px-2" : "sm:pl-2";
  const allMovieRatingsSelected = movieRatingOptions.every((opt) => settings[opt.key]);
  const allTvRatingsSelected = tvRatingOptions.every((opt) => settings[opt.key]);

  if (hasSupabaseAuth && !hasSignedInHost) {
    return (
      <div className="min-h-screen bg-[rgb(var(--bg))] px-4 py-8 text-[rgb(var(--text))] sm:px-6 sm:py-12">
        <div className="mx-auto flex min-h-[80vh] w-full max-w-3xl items-center justify-center">
          <div className="w-full rounded-2xl border border-white/12 bg-[rgb(var(--card))]/95 p-6 shadow-[0_24px_54px_rgba(0,0,0,0.45)] backdrop-blur sm:p-8">
            <div className="text-center">
              <h1 className="text-3xl font-semibold tracking-tight">Sign in to create a group</h1>
              <div className="mx-auto mt-3 max-w-xl text-sm text-white/72">
                Hosts need an account to create and manage groups. Guests can still join invite links without creating one.
              </div>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/signin?next=%2Fcreate">
                <Button>{isAuthReady ? "Create account or sign in" : "Checking account..."}</Button>
              </Link>
              <Link href="/">
                <Button variant="secondary">Back home</Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function onCardKeyDown(event: KeyboardEvent<HTMLDivElement>, onActivate: () => void) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate();
    }
  }

  function setGenreExcluded(genreId: number, excluded: boolean) {
    setSettings((s) => {
      const next = new Set(s.endless.excludedGenreIds);
      if (excluded) {
        next.add(genreId);
      } else {
        next.delete(genreId);
      }
      return {
        ...s,
        endless: {
          ...s.endless,
          excludedGenreIds: Array.from(next).sort((a, b) => a - b),
        },
      };
    });
  }

  function toggleAllMovieRatings() {
    const nextValue = !allMovieRatingsSelected;
    setSettings((s) => ({
      ...s,
      allowG: nextValue,
      allowPG: nextValue,
      allowPG13: nextValue,
      allowR: nextValue,
    }));
  }

  function toggleAllTvRatings() {
    const nextValue = !allTvRatingsSelected;
    setSettings((s) => ({
      ...s,
      allowTVY: nextValue,
      allowTVY7: nextValue,
      allowTVG: nextValue,
      allowTVPG: nextValue,
      allowTV14: nextValue,
      allowTVMA: nextValue,
    }));
  }

  function goToNextStep() {
    if (step === 0 && !canGoStep2) return;
    if (step === 1 && !canGoStep3) return;
    setStep((s) => (s === 2 ? 2 : ((s + 1) as Step)));
  }

  async function onCreate() {
    if (!canCreate || isCreating) return;

    const provisionalId = createGroupId();
    setIsCreating(true);
    setCreateError(null);
    try {
      setHostDisplayName(hostName);

      const created = await createGroup({
        id: provisionalId,
        name: groupName.trim(),
        createdAt: new Date().toISOString(),
        schemaVersion: 1,
        settings,
      });

      if (created.authFailed) {
        setCreateError("Host account sign-in is required before creating a group.");
        return;
      }

      const groupId = created.group.id;
      markHostForGroup(groupId);

      if (settings.ratingMode === "shortlist") {
        router.push(`/g/${groupId}/custom-list?from=create`);
      } else {
        router.push(`/g/${groupId}`);
      }
    } finally {
      setIsCreating(false);
    }
  }

  const stepTitle = step === 0 ? "Your name" : step === 1 ? "Name your group" : "Set up your chooser";

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Create group</h1>
            <div className="mt-1 text-sm text-white/60">Step {step + 1} of 3: {stepTitle}</div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl">
          <div
            className="flex w-[300%] transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${step * (100 / 3)}%)` }}
          >
            <div className="w-full pr-0 sm:pr-2">
              <Card interactive={false}>
                <CardTitle>Your name</CardTitle>
                <div className="mt-3 space-y-2">
                  <Input
                    value={hostName}
                    onChange={(e) => setHostName(e.target.value)}
                    placeholder="Your name"
                    autoComplete="off"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canGoStep2) {
                        e.preventDefault();
                        goToNextStep();
                      }
                    }}
                  />
                  <Muted>This is the name people in your group will see.</Muted>
                  <div className="pt-2">
                    <Button onClick={goToNextStep} disabled={!canGoStep2}>
                      Continue
                    </Button>
                  </div>
                </div>
              </Card>
            </div>

            <div className="w-full px-0 sm:px-2">
              <Card interactive={false}>
                <CardTitle>Name your group</CardTitle>
                <div className="mt-3 space-y-2">
                  <Input
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder={placeholders[phIndex]}
                    autoComplete="off"
                    inputMode="text"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canGoStep3) {
                        e.preventDefault();
                        goToNextStep();
                      }
                    }}
                  />
                  <Muted>Pick a name your group will recognize.</Muted>
                  <div className="pt-2">
                    <Button onClick={goToNextStep} disabled={!canGoStep3}>
                      Continue
                    </Button>
                  </div>
                </div>
              </Card>
            </div>

            <div className="w-full pl-0 sm:pl-2">
              <Card interactive={false}>
                <CardTitle>Choose mode</CardTitle>
                <div className="mt-3 space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSettings((s) => ({ ...s, ratingMode: "unlimited", shortlistItems: [] }))}
                      onKeyDown={(event) =>
                        onCardKeyDown(event, () =>
                          setSettings((s) => ({ ...s, ratingMode: "unlimited", shortlistItems: [] }))
                        )
                      }
                      className={[
                        "rounded-2xl border p-4 text-left transition focus:outline-none focus-visible:border-[rgb(var(--yellow))]/60 focus-visible:ring-2 focus-visible:ring-[rgb(var(--yellow))]/20",
                        settings.ratingMode === "unlimited"
                          ? "border-[rgb(var(--yellow))]/40 bg-[rgb(var(--card-2))] shadow-sm"
                          : "border-white/10 bg-white/5 hover:bg-white/10",
                      ].join(" ")}
                    >
                      <div className="text-sm font-semibold">Endless mode</div>
                      <div className="mt-1 text-sm text-white/60">
                        Keep rating titles until your group is ready to pick.
                      </div>
                    </div>

                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSettings((s) => ({ ...s, ratingMode: "shortlist" }))}
                      onKeyDown={(event) =>
                        onCardKeyDown(event, () => setSettings((s) => ({ ...s, ratingMode: "shortlist" })))
                      }
                      className={[
                        "rounded-2xl border p-4 text-left transition focus:outline-none focus-visible:border-[rgb(var(--yellow))]/60 focus-visible:ring-2 focus-visible:ring-[rgb(var(--yellow))]/20",
                        settings.ratingMode === "shortlist"
                          ? "border-[rgb(var(--yellow))]/40 bg-[rgb(var(--card-2))] shadow-sm"
                          : "border-white/10 bg-white/5 hover:bg-white/10",
                      ].join(" ")}
                    >
                      <div className="text-sm font-semibold">Custom list</div>
                      <div className="mt-1 text-sm text-white/60">
                        Pick a fixed list of titles for everyone to rate.
                      </div>
                    </div>
                  </div>

                  {settings.ratingMode === "unlimited" ? (
                    <div className="space-y-3">
                      <Card interactive={false}>
                        <CardTitle>Content</CardTitle>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() =>
                              setSettings((s) => ({
                                ...s,
                                contentType: "movies",
                                endless: { ...s.endless, mediaType: "movie" },
                              }))
                            }
                            onKeyDown={(event) =>
                              onCardKeyDown(event, () =>
                                setSettings((s) => ({
                                  ...s,
                                  contentType: "movies",
                                  endless: { ...s.endless, mediaType: "movie" },
                                }))
                              )
                            }
                            className={[
                              "rounded-2xl border p-4 text-left transition focus:outline-none focus-visible:border-[rgb(var(--yellow))]/60 focus-visible:ring-2 focus-visible:ring-[rgb(var(--yellow))]/20",
                              settings.contentType === "movies"
                                ? "border-[rgb(var(--yellow))]/40 bg-[rgb(var(--card-2))] shadow-sm"
                                : "border-white/10 bg-white/5 hover:bg-white/10",
                            ].join(" ")}
                          >
                            <div className="text-sm font-semibold">Movies only</div>
                          </div>

                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() =>
                              setSettings((s) => ({
                                ...s,
                                contentType: "movies_and_shows",
                                endless: { ...s.endless, mediaType: "movies_and_tv" },
                              }))
                            }
                            onKeyDown={(event) =>
                              onCardKeyDown(event, () =>
                                setSettings((s) => ({
                                  ...s,
                                  contentType: "movies_and_shows",
                                  endless: { ...s.endless, mediaType: "movies_and_tv" },
                                }))
                              )
                            }
                            className={[
                              "rounded-2xl border p-4 text-left transition focus:outline-none focus-visible:border-[rgb(var(--yellow))]/60 focus-visible:ring-2 focus-visible:ring-[rgb(var(--yellow))]/20",
                              settings.contentType === "movies_and_shows"
                                ? "border-[rgb(var(--yellow))]/40 bg-[rgb(var(--card-2))] shadow-sm"
                                : "border-white/10 bg-white/5 hover:bg-white/10",
                            ].join(" ")}
                          >
                            <div className="text-sm font-semibold">Movies + TV</div>
                          </div>
                        </div>
                      </Card>

                      <Card interactive={false}>
                        <CardTitle>Release year range</CardTitle>
                        <div className="mt-3 space-y-3">
                          <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 hover:bg-white/10">
                            <div>
                              <div className="text-sm font-semibold">Use release year range</div>
                              <div className="text-xs text-white/60">
                                Only show titles released between these years.
                              </div>
                            </div>
                            <input
                              type="checkbox"
                              checked={hasReleaseYearRange}
                              onChange={(e) =>
                                setSettings((s) => ({
                                  ...s,
                                  endless: {
                                    ...s.endless,
                                    releaseFrom: e.target.checked
                                      ? `${DATE_RANGE_DEFAULT_FROM_YEAR}-01-01`
                                      : null,
                                    releaseTo: e.target.checked ? `${currentYear}-12-31` : null,
                                  },
                                }))
                              }
                              className="h-4 w-4 accent-[rgb(var(--yellow))]"
                            />
                          </label>

                          {hasReleaseYearRange ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div>
                                <div className="text-sm font-semibold">From year</div>
                                <Input
                                  type="number"
                                  inputMode="numeric"
                                  min={1900}
                                  max={currentYear}
                                  value={releaseFromYear}
                                  onChange={(e) =>
                                    setSettings((s) => ({
                                      ...s,
                                      endless: {
                                        ...s.endless,
                                        releaseFrom:
                                          toYearBoundaryDate(e.target.value, "start") ?? s.endless.releaseFrom,
                                      },
                                    }))
                                  }
                                />
                              </div>
                              <div>
                                <div className="text-sm font-semibold">To year</div>
                                <Input
                                  type="number"
                                  inputMode="numeric"
                                  min={1900}
                                  max={currentYear}
                                  value={releaseToYear}
                                  onChange={(e) =>
                                    setSettings((s) => ({
                                      ...s,
                                      endless: {
                                        ...s.endless,
                                        releaseTo:
                                          toYearBoundaryDate(e.target.value, "end") ?? s.endless.releaseTo,
                                      },
                                    }))
                                  }
                                />
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </Card>

                      <Card interactive={false}>
                        <CardTitle>Filter out unpopular releases</CardTitle>
                        <div className="mt-3 space-y-3">
                          <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 hover:bg-white/10">
                            <div>
                              <div className="text-sm font-semibold">Filter out unpopular releases</div>
                              <div className="text-xs text-white/60">
                                Hides low-vote titles so picks stay familiar.
                              </div>
                            </div>
                            <input
                              type="checkbox"
                              checked={settings.endless.filterUnpopular}
                              onChange={(e) =>
                                setSettings((s) => ({
                                  ...s,
                                  endless: {
                                    ...s.endless,
                                    filterUnpopular: e.target.checked,
                                    minVoteCount: e.target.checked ? 200 : null,
                                  },
                                }))
                              }
                              className="h-4 w-4 accent-[rgb(var(--yellow))]"
                            />
                          </label>
                        </div>
                      </Card>

                      <Card interactive={false}>
                        <div className="flex items-center justify-between gap-2">
                          <CardTitle>Allowed movie ratings</CardTitle>
                          <Button variant="ghost" onClick={toggleAllMovieRatings}>
                            {allMovieRatingsSelected ? "Deselect all" : "Select all"}
                          </Button>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {movieRatingOptions.map((opt) => {
                            const checked = settings[opt.key];
                            return (
                              <label
                                key={opt.key}
                                className={[
                                  "relative flex min-h-[64px] cursor-pointer flex-col justify-center rounded-xl border px-2 py-2 text-center transition",
                                  checked
                                    ? "border-[rgb(var(--yellow))]/55 bg-white/12"
                                    : "border-white/10 bg-white/5 hover:bg-white/10",
                                ].join(" ")}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => setSettings((s) => ({ ...s, [opt.key]: e.target.checked }))}
                                  className="absolute right-2 top-2 h-4 w-4 accent-[rgb(var(--yellow))]"
                                />
                                <div className="text-sm font-semibold">{opt.label}</div>
                                <div className="mt-1 text-[11px] leading-tight text-white/60">{opt.desc}</div>
                              </label>
                            );
                          })}
                        </div>
                      </Card>

                      {settings.contentType === "movies_and_shows" ? (
                        <Card interactive={false}>
                          <div className="flex items-center justify-between gap-2">
                            <CardTitle>Allowed TV ratings</CardTitle>
                            <Button variant="ghost" onClick={toggleAllTvRatings}>
                              {allTvRatingsSelected ? "Deselect all" : "Select all"}
                            </Button>
                          </div>
                          <div className="mt-2 text-sm text-white/70">
                            Applied when Movies + TV is selected.
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                            {tvRatingOptions.map((opt) => {
                              const checked = settings[opt.key];
                              return (
                                <label
                                key={opt.key}
                                className={[
                                    "relative flex min-h-[64px] cursor-pointer flex-col justify-center rounded-xl border px-2 py-2 text-center transition",
                                    checked
                                      ? "border-[rgb(var(--yellow))]/55 bg-white/12"
                                      : "border-white/10 bg-white/5 hover:bg-white/10",
                                  ].join(" ")}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(e) => setSettings((s) => ({ ...s, [opt.key]: e.target.checked }))}
                                    className="absolute right-2 top-2 h-4 w-4 accent-[rgb(var(--yellow))]"
                                  />
                                  <div className="text-sm font-semibold">{opt.label}</div>
                                  <div className="mt-1 text-[11px] leading-tight text-white/60">{opt.desc}</div>
                                </label>
                              );
                            })}
                          </div>
                        </Card>
                      ) : null}

                      {!hasAtLeastOneAllowedRating ? (
                        <div className="rounded-xl border border-[rgb(var(--red))]/40 bg-[rgb(var(--red))]/10 p-3 text-sm text-white">
                          Select at least one allowed rating for your selected content type.
                        </div>
                      ) : null}

                      <Card interactive={false}>
                        <CardTitle>Exclude genres</CardTitle>
                        <div className="mt-2 text-sm text-white/70">
                          All genres are included by default. Select any you want to exclude.
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Button
                            variant="ghost"
                            onClick={() =>
                              setSettings((s) => ({
                                ...s,
                                endless: { ...s.endless, excludedGenreIds: [] },
                              }))
                            }
                            disabled={settings.endless.excludedGenreIds.length === 0}
                          >
                            Exclude none
                          </Button>
                          <span className="text-xs text-white/55">
                            {settings.endless.excludedGenreIds.length} excluded
                          </span>
                        </div>
                        <div className="mt-3">
                          {isLoadingGenres ? (
                            <Muted>Loading genres...</Muted>
                          ) : genreLoadError ? (
                            <div className="rounded-xl border border-[rgb(var(--red))]/40 bg-[rgb(var(--red))]/10 p-3 text-sm text-white">
                              {genreLoadError}
                            </div>
                          ) : genreOptions.length === 0 ? (
                            <Muted>No genres available right now.</Muted>
                          ) : (
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                              {genreOptions.map((genre) => {
                                const isExcluded = settings.endless.excludedGenreIds.includes(genre.id);
                                return (
                                  <button
                                    key={genre.id}
                                    type="button"
                                    aria-pressed={isExcluded}
                                    onClick={() => setGenreExcluded(genre.id, !isExcluded)}
                                    className={[
                                      "flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition",
                                      isExcluded
                                        ? "border-white/15 bg-white/20 text-white/55 hover:bg-white/25"
                                        : "border-white/10 bg-white/5 text-white/90 hover:bg-white/10",
                                    ].join(" ")}
                                  >
                                    <span className={["text-sm", isExcluded ? "line-through" : ""].join(" ")}>
                                      {genre.name}
                                    </span>
                                    <span
                                      className={[
                                        "rounded-full px-2 py-0.5 text-[11px]",
                                        isExcluded ? "bg-white/20 text-white/70" : "bg-white/10 text-white/65",
                                      ].join(" ")}
                                    >
                                      {isExcluded ? "Excluded" : "Included"}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </Card>

                      <Card interactive={false}>
                        <CardTitle>Streaming services</CardTitle>
                        <div className="mt-2">
                          <Muted>Streaming service filters are coming soon.</Muted>
                        </div>
                      </Card>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                      Filters are hidden in Custom list mode because you choose the exact titles next.
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </div>

        {createError ? (
          <div className="rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
            {createError}
          </div>
        ) : null}

        <div className={stepInsetClass}>
          <Card interactive={false}>
            <CardTitle>Navigation</CardTitle>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="ghost"
                onClick={() => setStep((s) => (s === 0 ? 0 : ((s - 1) as Step)))}
                disabled={step === 0 || isCreating}
              >
                Back
              </Button>

              {step < 2 ? (
                <Button
                  onClick={goToNextStep}
                  disabled={(step === 0 && !canGoStep2) || (step === 1 && !canGoStep3) || isCreating}
                >
                  Next
                </Button>
              ) : (
                <Button onClick={onCreate} disabled={!canCreate || isCreating}>
                  {isCreating ? "Creating..." : "Create group"}
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
