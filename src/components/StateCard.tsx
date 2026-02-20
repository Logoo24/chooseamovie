"use client";

import { Button, Card, CardTitle, Muted, Pill } from "@/components/ui";

type StateCardProps = {
  title: string;
  badge?: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  actionVariant?: "primary" | "secondary" | "ghost";
};

export function StateCard({
  title,
  badge,
  description,
  actionLabel,
  actionHref,
  actionVariant = "primary",
}: StateCardProps) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h1>
        {badge ? <Pill>{badge}</Pill> : null}
      </div>
      <Card className="max-w-2xl">
        <CardTitle>{title}</CardTitle>
        <div className="mt-3">
          <Muted>{description}</Muted>
        </div>
        {actionLabel && actionHref ? (
          <div className="mt-5">
            <a href={actionHref}>
              <Button variant={actionVariant}>{actionLabel}</Button>
            </a>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
