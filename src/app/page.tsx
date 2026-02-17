import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Button, Card, CardTitle, Muted, Pill } from "@/components/ui";
import { PopcornLogo } from "@/components/PopcornLogo";

export default function Home() {
  return (
    <AppShell>
      <div className="space-y-6">
        <Card>
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              <PopcornLogo className="h-14 w-14" />
            </div>

            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">
                  Pick something everyone will watch
                </h1>
                <Pill>Dark mode</Pill>
                <Pill>Mobile friendly</Pill>
              </div>

              <Muted>
                Create a group, share a link, and rate movies (and later shows). We will rank the best picks for your whole group.
              </Muted>

              <div className="flex flex-wrap gap-2 pt-2">
                <Link href="/create">
                  <Button>Start a group</Button>
                </Link>
                <a
                  className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/85 hover:bg-white/10"
                  href="https://www.google.com/search?q=classic+movie+night+popcorn"
                  target="_blank"
                  rel="noreferrer"
                >
                  Get inspiration
                </a>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>How it works</CardTitle>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3">
              <div className="text-sm font-semibold text-white">1) Create a group</div>
              <div className="mt-1 text-sm text-white/60">
                Choose movies only or movies plus shows, then set rating limits.
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3">
              <div className="text-sm font-semibold text-white">2) Share the link</div>
              <div className="mt-1 text-sm text-white/60">
                Everyone joins and rates titles. The app learns preferences.
              </div>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
