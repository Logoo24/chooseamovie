import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui";

type PlaceholderShellProps = {
  title: string;
  children: React.ReactNode;
};

export function PlaceholderShell({ title, children }: PlaceholderShellProps) {
  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-5 py-4 sm:py-6">
        <Link
          href="/"
          className="inline-flex items-center rounded-md px-1 py-1 text-sm text-white/72 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--yellow))]/35"
        >
          Home
        </Link>
        <Card>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
          <div className="mt-6 space-y-4 text-base leading-7 text-white/76">{children}</div>
        </Card>
      </div>
    </AppShell>
  );
}
