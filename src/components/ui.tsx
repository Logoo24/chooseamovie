"use client";

import React from "react";

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm">
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-semibold text-white">{children}</div>;
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-white/65">{children}</div>;
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={[
        "w-full rounded-xl border border-white/10 bg-[rgb(var(--card))] px-3 py-2",
        "text-white placeholder:text-white/40 outline-none",
        "focus:border-[rgb(var(--yellow))]/60 focus:ring-2 focus:ring-[rgb(var(--yellow))]/20",
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
    "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition active:translate-y-[1px] disabled:opacity-50 disabled:active:translate-y-0";
  const styles =
    variant === "primary"
      ? "bg-[rgb(var(--red))] text-white hover:brightness-110"
      : variant === "secondary"
        ? "bg-white/10 text-white hover:bg-white/15 border border-white/10"
        : "bg-transparent text-white/80 hover:bg-white/5 border border-white/10";

  return (
    <button {...props} className={[base, styles, props.className ?? ""].join(" ")}>
      {children}
    </button>
  );
}

export function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70">
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
