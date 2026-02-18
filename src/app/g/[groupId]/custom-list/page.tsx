"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PosterImage } from "@/components/PosterImage";
import { StateCard } from "@/components/StateCard";
import { Button, Card, CardTitle, Input, Muted, Pill } from "@/components/ui";
import { customListLabel, isCustomListMode } from "@/lib/groupLabels";
import { getGroup, updateGroupSettings } from "@/lib/groupStore";
import { isHostForGroup } from "@/lib/hostStore";
import {
  addToShortlist,
  getShortlist,
  removeFromShortlist,
  replaceShortlist,
  type ShortlistItem,
  type ShortlistMediaType,
  type ShortlistSnapshot,
} from "@/lib/shortlistStore";
import { ensureAnonymousSession, getCurrentUserId } from "@/lib/supabase";
import { buildTmdbTitleKey } from "@/lib/tmdbTitleKey";
import { upsertTitleSnapshot } from "@/lib/titleCacheStore";
import { loadGroup, saveGroup, type Group } from "@/lib/storage";

type SearchItem = {
  id: number;
  media_type: "movie" | "tv" | null;
  title_key?: string | null;
  title: string | null;
  name: string | null;
  release_date: string | null;
  first_air_date: string | null;
  poster_path: string | null;
  overview?: string | null;
};

type SearchResponse = {
  results: SearchItem[];
  error?: { message?: string };
};

const POSTER_BASE = "https://image.tmdb.org/t/p/w185";
const SUGGESTIONS_KEY = (groupId: string) => `chooseamovie:suggestions:${groupId}`;

function titleFromSearch(item: SearchItem) {
  return item.title ?? item.name ?? "Untitled";
}

function yearFromSearch(item: SearchItem) {
  const raw = item.release_date ?? item.first_air_date ?? "";
  return raw.length >= 4 ? raw.slice(0, 4) : null;
}

function mediaLabel(mediaType: "movie" | "tv" | null) {
  if (mediaType === "movie") return "Movie";
  if (mediaType === "tv") return "Show";
  return "Unknown";
}

function buildTitleKey(item: SearchItem) {
  if (item.media_type !== "movie" && item.media_type !== "tv") return "";
  return item.title_key?.trim() || buildTmdbTitleKey(item.media_type, item.id);
}

function toSnapshot(item: SearchItem): ShortlistSnapshot | null {
  if (item.media_type !== "movie" && item.media_type !== "tv") return null;
  return {
    title: titleFromSearch(item),
    year: yearFromSearch(item),
    poster_path: item.poster_path ?? null,
    media_type: item.media_type as ShortlistMediaType,
  };
}

export default function CustomListPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;
  const router = useRouter();

  const [group, setGroup] = useState<Group | null>(null);
  const [isLoadingGroup, setIsLoadingGroup] = useState(true);
  const [authBlocked, setAuthBlocked] = useState(false);
  const [authRetryKey, setAuthRetryKey] = useState(0);
  const [isHost, setIsHost] = useState(false);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchResults, setSearchResults] = useState<SearchItem[]>([]);
  const [suggestedResults, setSuggestedResults] = useState<SearchItem[]>([]);

  const [shortlist, setShortlist] = useState<ShortlistItem[]>([]);
  const [isLoadingShortlist, setIsLoadingShortlist] = useState(true);
  const [pendingKeys, setPendingKeys] = useState<Record<string, boolean>>({});
  const [isSavingAndNext, setIsSavingAndNext] = useState(false);

  const isTyping = query.trim().length > 0;
  const customLabel = group ? customListLabel(group.settings.contentType) : "Custom list";

  useEffect(() => {
    let alive = true;
    setIsLoadingGroup(true);
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
      const loaded = await getGroup(groupId);
      if (!alive) return;

      const localFallback = loadGroup(groupId);
      const resolved = loaded.group ?? localFallback;
      setGroup(resolved);

      const hostFromOwner = Boolean(resolved?.ownerUserId && uid && resolved.ownerUserId === uid);
      const hostFromLocalFlag = !resolved?.ownerUserId && isHostForGroup(groupId);
      setIsHost(hostFromOwner || hostFromLocalFlag);
      setIsLoadingGroup(false);
    })();

    return () => {
      alive = false;
    };
  }, [groupId, authRetryKey]);

  useEffect(() => {
    let alive = true;
    setIsLoadingShortlist(true);

    (async () => {
      const rows = await getShortlist(groupId);
      if (!alive) return;
      setShortlist(rows);
      setIsLoadingShortlist(false);
    })();

    return () => {
      alive = false;
    };
  }, [groupId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const raw = localStorage.getItem(SUGGESTIONS_KEY(groupId));
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as SearchItem[];
      setSuggestedResults(parsed);
    } catch {
      // ignore draft parse errors
    }
  }, [groupId]);

  useEffect(() => {
    let alive = true;

    const fetchSuggestions = async () => {
      if (!group) return;
      if (suggestedResults.length > 0) return;

      try {
        const fallbackQuery = group.settings.contentType === "movies" ? "popular movies" : "popular";
        const response = await fetch(
          `/api/tmdb/search?q=${encodeURIComponent(fallbackQuery)}&type=multi&page=1`
        );
        const body = (await response.json()) as SearchResponse;
        if (!response.ok || !alive) return;

        const filtered = (body.results ?? []).filter((item) => {
          if (item.media_type !== "movie" && item.media_type !== "tv") return false;
          if (group.settings.contentType === "movies") return item.media_type === "movie";
          return true;
        });

        const top = filtered.slice(0, 10);
        setSuggestedResults(top);
        localStorage.setItem(SUGGESTIONS_KEY(groupId), JSON.stringify(top));
      } catch {
        // optional suggestions only
      }
    };

    void fetchSuggestions();
    return () => {
      alive = false;
    };
  }, [group, suggestedResults.length, groupId]);

  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (!debouncedQuery) {
        setSearchResults([]);
        setSearchError("");
        return;
      }

      setIsSearching(true);
      setSearchError("");

      try {
        const response = await fetch(`/api/tmdb/search?q=${encodeURIComponent(debouncedQuery)}&type=multi`);
        const body = (await response.json()) as SearchResponse;

        if (!response.ok) {
          setSearchResults([]);
          setSearchError(body.error?.message ?? "Search failed.");
          return;
        }

        if (!alive) return;

        const filtered = (body.results ?? []).filter((item) => {
          if (item.media_type !== "movie" && item.media_type !== "tv") return false;
          if (group?.settings.contentType === "movies") return item.media_type === "movie";
          return true;
        });

        setSearchResults(filtered);
      } catch {
        setSearchResults([]);
        setSearchError("Network error while searching.");
      } finally {
        if (alive) setIsSearching(false);
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [debouncedQuery, group]);

  const shortlistKeys = useMemo(() => {
    return new Set(shortlist.map((item) => item.title_id));
  }, [shortlist]);

  useEffect(() => {
    if (!group) return;
    const nextItems = shortlist.map((item) => item.title_snapshot.title);
    const same =
      group.settings.shortlistItems.length === nextItems.length &&
      group.settings.shortlistItems.every((item, idx) => item === nextItems[idx]);
    if (same) return;

    const nextGroup: Group = {
      ...group,
      settings: {
        ...group.settings,
        shortlistItems: nextItems,
      },
    };
    setGroup(nextGroup);
    saveGroup(nextGroup);
  }, [group, shortlist]);

  async function refreshShortlist() {
    const rows = await getShortlist(groupId);
    setShortlist(rows);
  }

  async function onAdd(item: SearchItem) {
    const titleKey = buildTitleKey(item);
    const snapshot = toSnapshot(item);
    if (!titleKey || !snapshot) return;

    setPendingKeys((prev) => ({ ...prev, [titleKey]: true }));
    try {
      await addToShortlist(groupId, titleKey, snapshot);
      await upsertTitleSnapshot(titleKey, {
        title_id: titleKey,
        title: snapshot.title,
        year: snapshot.year,
        media_type: snapshot.media_type,
        poster_path: snapshot.poster_path,
        overview: item.overview ?? null,
      });
      await refreshShortlist();
      setQuery("");
      setDebouncedQuery("");
    } finally {
      setPendingKeys((prev) => {
        const next = { ...prev };
        delete next[titleKey];
        return next;
      });
    }
  }

  async function onRemove(titleKey: string) {
    setPendingKeys((prev) => ({ ...prev, [titleKey]: true }));
    try {
      await removeFromShortlist(groupId, titleKey);
      await refreshShortlist();
    } finally {
      setPendingKeys((prev) => {
        const next = { ...prev };
        delete next[titleKey];
        return next;
      });
    }
  }

  async function onNext() {
    if (!group || shortlist.length < 2 || isSavingAndNext) return;
    const confirmed = window.confirm("Save this custom list and return to the group hub?");
    if (!confirmed) return;

    setIsSavingAndNext(true);

    try {
      await replaceShortlist(
        groupId,
        shortlist.map((item) => ({ titleKey: item.title_id, snapshot: item.title_snapshot }))
      );

      const nextSettings = {
        ...group.settings,
        ratingMode: "shortlist" as const,
        shortlistItems: shortlist.map((item) => item.title_snapshot.title),
      };

      const updated = await updateGroupSettings(groupId, nextSettings);
      if (updated.group) {
        setGroup(updated.group);
      }

      router.push(`/g/${groupId}`);
    } finally {
      setIsSavingAndNext(false);
    }
  }

  if (isLoadingGroup) {
    return (
      <AppShell>
        <StateCard
          title="Loading custom list"
          badge="Please wait"
          description="Checking your group and host access."
        />
      </AppShell>
    );
  }

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
          description="This group could not be found."
          actionHref="/create"
          actionLabel="Create a group"
        />
      </AppShell>
    );
  }

  if (!isHost) {
    return (
      <AppShell>
        <StateCard
          title="Hosts only"
          badge="Restricted"
          description="Only the host can build or edit this custom list."
          actionHref={`/g/${groupId}`}
          actionLabel="Back to hub"
          actionVariant="secondary"
        />
      </AppShell>
    );
  }

  if (!isCustomListMode(group)) {
    return (
      <AppShell>
        <StateCard
          title="Custom list mode is off"
          badge="Mode"
          description="Switch this group to Custom list mode before editing titles."
          actionHref={`/g/${groupId}`}
          actionLabel="Back to hub"
          actionVariant="secondary"
        />
      </AppShell>
    );
  }

  const visibleResults = isTyping ? searchResults : suggestedResults;
  const resultsTitle = isTyping ? "Search results" : "Suggested titles";

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{customLabel}</h1>
            <div className="mt-1 text-sm text-white/60">Add at least 2 titles before continuing.</div>
          </div>
          <div className="flex items-center gap-2">
            <Pill>{shortlist.length} title(s)</Pill>
          </div>
        </div>

        <Card>
          <CardTitle>Search titles</CardTitle>
          <div className="mt-3 space-y-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                group.settings.contentType === "movies"
                  ? "Search movies..."
                  : "Search movies and shows..."
              }
              autoComplete="off"
            />
            <Muted>
              {isSearching
                ? "Searching..."
                : isTyping
                  ? `Showing matches for \"${debouncedQuery || query.trim()}\"`
                  : "Suggestions are shown when search is empty."}
            </Muted>
          </div>
        </Card>

        <Card>
          <CardTitle>Added to your list</CardTitle>
          {isLoadingShortlist ? (
            <div className="mt-3 space-y-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-white/10" />
            </div>
          ) : shortlist.length === 0 ? (
            <div className="mt-3">
              <Muted>No titles added yet.</Muted>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {shortlist.map((item) => (
                <div
                  key={item.title_id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[rgb(var(--card))] p-2"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <PosterImage
                      src={item.title_snapshot.poster_path ? `${POSTER_BASE}${item.title_snapshot.poster_path}` : null}
                      alt={item.title_snapshot.title}
                      className="w-10 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">
                        {item.title_snapshot.title}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-white/65">
                        <span>{item.title_snapshot.year ?? "Unknown year"}</span>
                        <Pill>{mediaLabel(item.title_snapshot.media_type)}</Pill>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => void onRemove(item.title_id)}
                    disabled={Boolean(pendingKeys[item.title_id])}
                  >
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardTitle>{resultsTitle}</CardTitle>
          {searchError ? (
            <div className="mt-3 rounded-xl border border-red-400/30 bg-red-500/10 p-3 text-sm text-red-100">
              {searchError}
            </div>
          ) : null}

          {visibleResults.length === 0 && !isSearching ? (
            <div className="mt-3">
              <Muted>{isTyping ? "No matches found." : "No suggestions yet."}</Muted>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {visibleResults.map((item) => {
                const title = titleFromSearch(item);
                const year = yearFromSearch(item);
                const titleKey = buildTitleKey(item);
                const alreadyAdded = titleKey ? shortlistKeys.has(titleKey) : false;

                return (
                  <div
                    key={`${item.media_type}:${item.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[rgb(var(--card))] p-2"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <PosterImage
                        src={item.poster_path ? `${POSTER_BASE}${item.poster_path}` : null}
                        alt={title}
                        className="w-10 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">{title}</div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-white/65">
                          <span>{year ?? "Unknown year"}</span>
                          <Pill>{mediaLabel(item.media_type)}</Pill>
                        </div>
                      </div>
                    </div>
                    <Button
                      onClick={() => void onAdd(item)}
                      disabled={!titleKey || alreadyAdded || Boolean(pendingKeys[titleKey])}
                    >
                      {alreadyAdded ? "Added" : "Add"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => router.push(`/g/${groupId}`)}>
            Back
          </Button>
          <Button onClick={onNext} disabled={shortlist.length < 2 || isSavingAndNext}>
            {isSavingAndNext ? "Saving..." : "Next"}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
