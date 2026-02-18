"use client";

import { useMemo, useState } from "react";

type StarRatingProps = {
  value: number;
  onChange: (v: 1 | 2 | 3 | 4 | 5) => void;
  disabled?: boolean;
  showLabels?: boolean;
  showNumericHint?: boolean;
};

const LABELS = ["Skip", "Low", "Maybe", "Good", "Love"];

export function StarRating({
  value,
  onChange,
  disabled = false,
  showLabels = true,
  showNumericHint = true,
}: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const [popAt, setPopAt] = useState<number | null>(null);

  const activeValue = hoverValue ?? value;

  function choose(v: 1 | 2 | 3 | 4 | 5) {
    if (disabled) return;
    onChange(v);
    setPopAt(v);
    window.setTimeout(() => setPopAt(null), 170);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;

    const current = value > 0 ? value : 1;
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      const next = Math.max(1, current - 1) as 1 | 2 | 3 | 4 | 5;
      choose(next);
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = Math.min(5, current + 1) as 1 | 2 | 3 | 4 | 5;
      choose(next);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      choose(1);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      choose(5);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(current as 1 | 2 | 3 | 4 | 5);
    }
  }

  const numericHint = useMemo(() => {
    if (!showNumericHint) return null;
    if (activeValue <= 0) return "Tap a star";
    return `${activeValue}/5`;
  }, [activeValue, showNumericHint]);

  return (
    <div className="space-y-3">
      <div
        role="radiogroup"
        aria-label="Star rating"
        onKeyDown={onKeyDown}
        className="flex items-center justify-center gap-2"
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const isActive = n <= activeValue;
          const isPopping = n === popAt;

          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              disabled={disabled}
              onMouseEnter={() => setHoverValue(n)}
              onMouseLeave={() => setHoverValue(null)}
              onFocus={() => setHoverValue(n)}
              onBlur={() => setHoverValue(null)}
              onClick={() => choose(n as 1 | 2 | 3 | 4 | 5)}
              className={[
                "group relative flex h-14 w-14 items-center justify-center rounded-full border transition",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--yellow))]/30",
                disabled ? "opacity-60" : "",
                isActive
                  ? "border-[rgb(var(--yellow))]/60 bg-[rgb(var(--yellow))]/20 shadow-[0_0_18px_rgba(255,204,51,0.26)]"
                  : "border-white/15 bg-white/5 hover:bg-white/10",
                isPopping ? "scale-110" : "scale-100",
              ].join(" ")}
            >
              <span
                className={[
                  "text-3xl leading-none transition-all duration-150 select-none",
                  isActive ? "text-[rgb(var(--yellow))]" : "text-white/45",
                  isPopping ? "scale-110" : "scale-100",
                ].join(" ")}
              >
                ★
              </span>
            </button>
          );
        })}
      </div>

      {showLabels ? (
        <div className="grid grid-cols-5 text-center text-[11px] text-white/50">
          {LABELS.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      ) : null}

      {numericHint ? (
        <div className="text-center text-xs text-white/60">{numericHint}</div>
      ) : null}
    </div>
  );
}
