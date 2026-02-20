import { PosterImage } from "@/components/PosterImage";

type HeroMockCardProps = {
  stacked?: boolean;
  className?: string;
  title?: HeroCardTitle;
  ratingValue?: number;
  isBouncing?: boolean;
};

export type HeroCardTitle = {
  displayTitle: string;
  title: string;
  year: string | null;
  mediaType: "movie" | "tv";
  voteAverage: number | null;
  posterUrl: string | null;
  moreInfoHref?: string;
};

const defaultTitle: HeroCardTitle = {
  displayTitle: "The Truman Show",
  title: "The Truman Show",
  year: "1998",
  mediaType: "movie",
  voteAverage: 7.5,
  posterUrl: null,
  moreInfoHref: "https://www.google.com/search?q=the+truman+show+movie",
};

function toStarCount(voteAverage: number | null) {
  if (typeof voteAverage !== "number") return 3;
  return Math.max(1, Math.min(5, Math.round(voteAverage / 2)));
}

function Star({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={["h-5 w-5", filled ? "fill-current" : "fill-none stroke-current stroke-1.5"].join(" ")}
      aria-hidden="true"
    >
      <path d="m12 3 2.7 5.46 6.03.88-4.36 4.24 1.03 6-5.4-2.84-5.4 2.84 1.03-6L3.27 9.34l6.03-.88L12 3Z" />
    </svg>
  );
}

export function HeroMockCard({
  stacked = false,
  className = "",
  title = defaultTitle,
  ratingValue,
  isBouncing = false,
}: HeroMockCardProps) {
  const starCount = Math.max(0, Math.min(5, ratingValue ?? toStarCount(title.voteAverage)));

  return (
    <div
      className={[
        "relative transition-all duration-300 motion-reduce:transition-none",
        "translate-y-0 opacity-100",
        className,
      ].join(" ")}
    >
      {stacked ? (
        <div
          aria-hidden="true"
          className="absolute inset-x-8 top-5 h-full rounded-3xl border border-white/10 bg-[rgb(var(--card-2))]/55"
        />
      ) : null}

      <div className="relative rounded-3xl border border-white/15 bg-[rgb(var(--card-2))] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.35)] sm:p-5">
        <div className="flex gap-4">
          <PosterImage
            src={title.posterUrl}
            alt={`${title.displayTitle} poster`}
            className="h-32 w-24 shrink-0 rounded-xl sm:h-40 sm:w-28"
            roundedClassName="rounded-xl"
          />

          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-semibold text-white">{title.displayTitle}</div>
            <div className="mt-1 text-sm text-white/70">
              {title.mediaType === "tv" ? "TV Series" : "Movie"}
              {title.year ? ` - ${title.year}` : ""}
            </div>

            <div className="mt-4">
              <div role="radiogroup" aria-label="Preview rating controls" className="flex items-center justify-start gap-2">
                {[1, 2, 3, 4, 5].map((n) => {
                  const isActive = n <= starCount;
                  return (
                    <button
                      key={n}
                      type="button"
                      disabled
                      aria-label={`${n} stars`}
                      className={[
                        "group relative flex h-10 w-10 items-center justify-center rounded-full border transition-[background-color,border-color,box-shadow,transform,opacity] duration-220 disabled:cursor-not-allowed",
                        isActive
                          ? "border-[rgb(var(--yellow))]/60 bg-[rgb(var(--yellow))]/20 shadow-[0_0_18px_rgba(255,204,51,0.26)]"
                          : "border-white/15 bg-white/5",
                        isActive && isBouncing ? "cam-star-pop" : "",
                      ].join(" ")}
                    >
                      <span className={["text-[rgb(var(--yellow))]", isActive ? "opacity-100" : "opacity-35"].join(" ")}>
                        <Star filled={isActive} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <a
                href={title.moreInfoHref ?? `https://www.google.com/search?q=${encodeURIComponent(`${title.displayTitle} ${title.mediaType === "tv" ? "show" : "movie"}`)}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-[rgb(var(--yellow))] underline decoration-white/25 underline-offset-4 transition hover:text-[rgb(var(--yellow))]/90"
              >
                More info
              </a>
              <button
                type="button"
                disabled
                className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm font-medium text-white/85 disabled:cursor-not-allowed disabled:opacity-80"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
