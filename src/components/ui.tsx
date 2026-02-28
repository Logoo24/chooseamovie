"use client";

import React from "react";

export function Card({
  children,
  className = "",
  interactive = true,
}: {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={[
        "cam-soft-surface rounded-2xl p-4 sm:p-5",
        interactive
          ? "transition duration-300 ease-out hover:border-white/20"
          : "border-white/12",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-semibold tracking-tight text-white">{children}</div>;
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <div className="text-sm leading-relaxed text-white/68">{children}</div>;
}

export function LoadingSpinner({
  className = "h-4 w-4",
}: {
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={[
        "inline-block animate-spin rounded-full border-2 border-white/20 border-t-white",
        className,
      ].join(" ")}
    />
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full rounded-xl border border-white/14 bg-black/25 px-3.5 py-2.5",
        "text-white placeholder:text-white/40 outline-none transition",
        "focus:border-[rgb(var(--yellow))]/60 focus:ring-2 focus:ring-[rgb(var(--yellow))]/25",
        props.className ?? "",
      ].join(" ")}
    />
  );
}

export function Button({
  children,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
}) {
  const base =
    "inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--yellow))]/35 active:translate-y-[1px] disabled:opacity-50 disabled:active:translate-y-0";
  const styles =
    variant === "primary"
      ? "border border-[rgb(var(--red))]/45 bg-[linear-gradient(160deg,rgba(229,9,20,0.96),rgba(183,7,16,0.96))] text-white shadow-[0_10px_24px_rgba(229,9,20,0.25)] hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_14px_28px_rgba(229,9,20,0.32)]"
      : variant === "secondary"
        ? "border border-white/16 bg-white/[0.06] text-white/95 hover:-translate-y-0.5 hover:bg-white/[0.12]"
        : "border border-white/14 bg-transparent text-white/82 hover:bg-white/[0.06] hover:text-white";

  return (
    <button {...props} className={[base, styles, props.className ?? ""].join(" ")}>
      {children}
    </button>
  );
}

export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/14 bg-white/[0.06] px-2.5 py-1 text-xs font-medium text-white/76">
      {children}
    </span>
  );
}

export function ToggleRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-white">{label}</div>
        {description ? <div className="text-sm text-white/60">{description}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
