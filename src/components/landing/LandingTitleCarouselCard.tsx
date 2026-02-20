"use client";

import { useEffect, useState } from "react";
import { HeroMockCard, type HeroCardTitle } from "@/components/landing/HeroMockCard";

type LandingApiTitle = {
  id: number | null;
  media_type: "movie" | "tv";
  display_title: string;
  title: string;
  year: string | null;
  vote_average: number | null;
  poster_url: string | null;
};

type LandingApiResponse = {
  titles?: LandingApiTitle[];
};

type LandingTitleCarouselCardProps = {
  stacked?: boolean;
  className?: string;
};

type SlotId = 0 | 1;

type SlotState = {
  titleIndex: number;
  ratingValue: number;
  isBouncing: boolean;
};

type CarouselState = {
  titles: HeroCardTitle[];
  activeSlot: SlotId;
  isTransitioning: boolean;
  slots: [SlotState, SlotState];
};

const FALLBACK_TITLES: HeroCardTitle[] = [
  {
    displayTitle: "The Truman Show",
    title: "The Truman Show",
    year: "1998",
    mediaType: "movie",
    voteAverage: null,
    posterUrl: null,
    moreInfoHref: "https://www.google.com/search?q=the+truman+show+movie",
  },
  {
    displayTitle: "Baby Driver",
    title: "Baby Driver",
    year: "2017",
    mediaType: "movie",
    voteAverage: null,
    posterUrl: null,
    moreInfoHref: "https://www.google.com/search?q=baby+driver+movie",
  },
  {
    displayTitle: "Avengers",
    title: "Avengers",
    year: "2012",
    mediaType: "movie",
    voteAverage: null,
    posterUrl: null,
    moreInfoHref: "https://www.google.com/search?q=the+avengers+movie",
  },
  {
    displayTitle: "Avengers: Endgame",
    title: "Avengers: Endgame",
    year: "2019",
    mediaType: "movie",
    voteAverage: null,
    posterUrl: null,
    moreInfoHref: "https://www.google.com/search?q=avengers+endgame+movie",
  },
  {
    displayTitle: "Bridgerton",
    title: "Bridgerton",
    year: "2020",
    mediaType: "tv",
    voteAverage: null,
    posterUrl: null,
    moreInfoHref: "https://www.google.com/search?q=bridgerton+series",
  },
  {
    displayTitle: "Jurassic Park",
    title: "Jurassic Park",
    year: "1993",
    mediaType: "movie",
    voteAverage: null,
    posterUrl: null,
    moreInfoHref: "https://www.google.com/search?q=jurassic+park+movie",
  },
  {
    displayTitle: "High School Musical",
    title: "High School Musical",
    year: "2006",
    mediaType: "movie",
    voteAverage: null,
    posterUrl: null,
    moreInfoHref: "https://www.google.com/search?q=high+school+musical+movie",
  },
];

const PRE_RATE_DELAY_MS = 3800;
const POST_RATE_HOLD_MS = 1700;
const TRANSITION_DURATION_MS = 500;
const BOUNCE_DURATION_MS = 240;

let cachedTitles: HeroCardTitle[] | null = null;
let inflightFetch: Promise<HeroCardTitle[]> | null = null;
let runtimeStarted = false;
let cycleTimeoutIds: number[] = [];

function buildInitialState(titles: HeroCardTitle[]): CarouselState {
  const normalizedTitles = titles.length > 0 ? titles : FALLBACK_TITLES;
  const secondIndex = normalizedTitles.length > 1 ? 1 : 0;
  return {
    titles: normalizedTitles,
    activeSlot: 0,
    isTransitioning: false,
    slots: [
      { titleIndex: 0, ratingValue: 0, isBouncing: false },
      { titleIndex: secondIndex, ratingValue: 0, isBouncing: false },
    ],
  };
}

let runtimeState: CarouselState = buildInitialState(FALLBACK_TITLES);

const listeners = new Set<(next: CarouselState) => void>();

function emit() {
  for (const listener of listeners) {
    listener(runtimeState);
  }
}

function sameState(a: CarouselState, b: CarouselState) {
  return (
    a.titles === b.titles &&
    a.activeSlot === b.activeSlot &&
    a.isTransitioning === b.isTransitioning &&
    a.slots[0].titleIndex === b.slots[0].titleIndex &&
    a.slots[0].ratingValue === b.slots[0].ratingValue &&
    a.slots[0].isBouncing === b.slots[0].isBouncing &&
    a.slots[1].titleIndex === b.slots[1].titleIndex &&
    a.slots[1].ratingValue === b.slots[1].ratingValue &&
    a.slots[1].isBouncing === b.slots[1].isBouncing
  );
}

function setRuntimeState(next: CarouselState | ((prev: CarouselState) => CarouselState)) {
  const resolvedNext = typeof next === "function" ? next(runtimeState) : next;
  if (sameState(runtimeState, resolvedNext)) return;
  runtimeState = resolvedNext;
  emit();
}

function getInactiveSlot(slot: SlotId): SlotId {
  return slot === 0 ? 1 : 0;
}

function clearCycle() {
  for (const id of cycleTimeoutIds) {
    window.clearTimeout(id);
  }
  cycleTimeoutIds = [];
}

function addCycleTimeout(fn: () => void, delayMs: number) {
  const id = window.setTimeout(fn, delayMs);
  cycleTimeoutIds.push(id);
}

function randomRating() {
  return Math.floor(Math.random() * 4) + 2;
}

function scheduleCycle() {
  clearCycle();

  setRuntimeState((prev) => {
    const activeSlot = prev.activeSlot;
    const inactiveSlot = getInactiveSlot(activeSlot);
    const slots = [...prev.slots] as [SlotState, SlotState];
    slots[activeSlot] = {
      ...slots[activeSlot],
      ratingValue: 0,
      isBouncing: false,
    };
    slots[inactiveSlot] = {
      ...slots[inactiveSlot],
      ratingValue: 0,
      isBouncing: false,
    };
    return {
      ...prev,
      isTransitioning: false,
      slots,
    };
  });

  addCycleTimeout(() => {
    setRuntimeState((prev) => {
      const activeSlot = prev.activeSlot;
      const slots = [...prev.slots] as [SlotState, SlotState];
      slots[activeSlot] = {
        ...slots[activeSlot],
        ratingValue: randomRating(),
        isBouncing: true,
      };
      return { ...prev, slots };
    });
  }, PRE_RATE_DELAY_MS);

  addCycleTimeout(() => {
    setRuntimeState((prev) => {
      const activeSlot = prev.activeSlot;
      const slots = [...prev.slots] as [SlotState, SlotState];
      slots[activeSlot] = {
        ...slots[activeSlot],
        isBouncing: false,
      };
      return { ...prev, slots };
    });
  }, PRE_RATE_DELAY_MS + BOUNCE_DURATION_MS);

  if (runtimeState.titles.length <= 1) return;

  const transitionStartMs = PRE_RATE_DELAY_MS + POST_RATE_HOLD_MS;
  addCycleTimeout(() => {
    setRuntimeState((prev) => {
      const activeSlot = prev.activeSlot;
      const incomingSlot = getInactiveSlot(activeSlot);
      const currentTitleIndex = prev.slots[activeSlot].titleIndex;
      const nextTitleIndex = (currentTitleIndex + 1) % prev.titles.length;
      const slots = [...prev.slots] as [SlotState, SlotState];

      slots[incomingSlot] = {
        titleIndex: nextTitleIndex,
        ratingValue: 0,
        isBouncing: false,
      };

      return {
        ...prev,
        isTransitioning: true,
        slots,
      };
    });
  }, transitionStartMs);

  addCycleTimeout(() => {
    setRuntimeState((prev) => {
      const oldActiveSlot = prev.activeSlot;
      const incomingSlot = getInactiveSlot(oldActiveSlot);
      const slots = [...prev.slots] as [SlotState, SlotState];

      slots[oldActiveSlot] = {
        ...slots[oldActiveSlot],
        ratingValue: 0,
        isBouncing: false,
      };

      return {
        ...prev,
        activeSlot: incomingSlot,
        isTransitioning: false,
        slots,
      };
    });
    scheduleCycle();
  }, transitionStartMs + TRANSITION_DURATION_MS);
}

function toCardTitle(apiTitle: LandingApiTitle): HeroCardTitle {
  const tmdbLink =
    apiTitle.id && apiTitle.media_type
      ? `https://www.themoviedb.org/${apiTitle.media_type}/${apiTitle.id}`
      : null;
  const searchLink = `https://www.google.com/search?q=${encodeURIComponent(
    `${apiTitle.display_title} ${apiTitle.media_type === "tv" ? "show" : "movie"}`
  )}`;

  return {
    displayTitle: apiTitle.display_title,
    title: apiTitle.title,
    year: apiTitle.year,
    mediaType: apiTitle.media_type,
    voteAverage: apiTitle.vote_average,
    posterUrl: apiTitle.poster_url,
    moreInfoHref: tmdbLink ?? searchLink,
  };
}

async function fetchLandingTitles(): Promise<HeroCardTitle[]> {
  const response = await fetch("/api/tmdb/landing-samples?language=en-US", {
    cache: "force-cache",
  });
  if (!response.ok) return FALLBACK_TITLES;

  const body = (await response.json()) as LandingApiResponse;
  const parsed = Array.isArray(body.titles) ? body.titles.map(toCardTitle) : [];
  if (parsed.length === 0) return FALLBACK_TITLES;
  return parsed;
}

function ensureRuntimeStarted() {
  if (runtimeStarted) return;
  runtimeStarted = true;
  scheduleCycle();

  void (async () => {
    if (cachedTitles) {
      setRuntimeState(buildInitialState(cachedTitles));
      scheduleCycle();
      return;
    }

    if (!inflightFetch) {
      inflightFetch = fetchLandingTitles();
    }

    const loaded = await inflightFetch;
    cachedTitles = loaded;
    setRuntimeState(buildInitialState(loaded));
    scheduleCycle();
  })();
}

function maybeStopRuntime() {
  if (listeners.size > 0) return;
  clearCycle();
  runtimeStarted = false;
}

export function LandingTitleCarouselCard({ stacked = false, className = "" }: LandingTitleCarouselCardProps) {
  const [state, setState] = useState<CarouselState>(runtimeState);

  useEffect(() => {
    const onState = (next: CarouselState) => setState(next);
    listeners.add(onState);
    ensureRuntimeStarted();
    onState(runtimeState);

    return () => {
      listeners.delete(onState);
      maybeStopRuntime();
    };
  }, []);

  const titles = state.titles.length > 0 ? state.titles : FALLBACK_TITLES;
  const activeSlot = state.activeSlot;
  const incomingSlot = getInactiveSlot(activeSlot);

  function getTitleForSlot(slot: SlotId) {
    const slotState = state.slots[slot];
    const safeIndex = slotState.titleIndex % titles.length;
    return titles[safeIndex] ?? FALLBACK_TITLES[0];
  }

  return (
    <div className={["relative", className].join(" ")}>
      {[0, 1].map((slotNumber) => {
        const slot = slotNumber as SlotId;
        const slotState = state.slots[slot];
        const isActive = slot === activeSlot;
        const isIncoming = state.isTransitioning && slot === incomingSlot;

        const layerClass = isIncoming
          ? "landing-card-slide-over absolute inset-0 z-20"
          : isActive && state.isTransitioning
            ? "landing-card-under relative z-10"
            : isActive
              ? "relative z-10"
              : "absolute inset-0 z-0 pointer-events-none opacity-0";

        return (
          <div key={slot} className={layerClass}>
            <HeroMockCard
              stacked={stacked}
              title={getTitleForSlot(slot)}
              ratingValue={slotState.ratingValue}
              isBouncing={slotState.isBouncing}
            />
          </div>
        );
      })}
    </div>
  );
}
