"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button, Card, CardTitle, Muted, Pill } from "@/components/ui";
import { getGroupRatings, type GroupRatingsResult } from "@/lib/ratingStore";
import { getActiveMember } from "@/lib/ratings";
import { loadGroup, type Group } from "@/lib/storage";
import { TITLES, titleSearchUrl } from "@/lib/titles";
import { type MemberRatings } from "@/lib/ratings";

function starsText(avg: number) {
  if (!avg) return "—";
  return avg.toFixed(2);
}

function TitleName({ titleId }: { titleId: string }) {
  const t = TITLES.find((x) => x.id === titleId);
  if (!t) return <span className="text-white/70">{titleId}</span>;
  return (
    <a
      href={titleSearchUrl(t)}
      target="_blank"
      rel="noreferrer"
      className="font-semibold text-white hover:underline"
    >
      {t.name} {t.year ? <span className="text-white/60">({t.year})</span> : null}
    </a>
  );
}

function memberScore(r: MemberRatings, titleId: string) {
  const v = r[titleId];
  if (v === undefined) return "—";
  if (v === 0) return "skip";
  return `${v}★`;
}

export default function ResultsPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;
  const router = useRouter();

  const [group, setGroup] = useState<Group | null>(null);
  const [rows, setRows] = useState<GroupRatingsResult | null>(null);
  const [isLoadingRows, setIsLoadingRows] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeMember, setActiveMember] = useState<ReturnType<typeof getActiveMember>>(null);

  useEffect(() => {
    let alive = true;
    let inFlight = false;
    setIsLoadingRows(true);
    setGroup(loadGroup(groupId));
    setActiveMember(getActiveMember(groupId));

    const fetchRatings = async (opts?: { background?: boolean }) => {
      if (inFlight) return;
      inFlight = true;
      const background = opts?.background ?? false;
      if (background) setIsRefreshing(true);

      try {
        const loaded = await getGroupRatings(groupId);
        if (!alive) return;
        setRows(loaded);
      } finally {
        if (!alive) return;
        setIsLoadingRows(false);
        setIsRefreshing(false);
        inFlight = false;
      }
    };

    void fetchRatings();
    const intervalId = window.setInterval(() => {
      void fetchRatings({ background: true });
    }, 3000);

    return () => {
      alive = false;
      window.clearInterval(intervalId);
    };
  }, [groupId]);

  const top = useMemo(() => {
    if (!rows) return [];
    return rows.rows.slice(0, 10);
  }, [rows]);

  if (!group) {
    return (
      <AppShell>
        <Card>
          <CardTitle>Group not found</CardTitle>
          <div className="mt-2">
            <Muted>This group does not exist on this device yet.</Muted>
          </div>
          <div className="mt-4">
            <a href="/create">
              <Button>Create a group</Button>
            </a>
          </div>
        </Card>
      </AppShell>
    );
  }

  const members = rows?.members ?? [];
  const perMember = rows?.perMember ?? {};
  const accessDenied = rows?.accessDenied === true;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">Results</h1>
            <div className="mt-1 text-sm text-white/60">{group.name}</div>
          </div>
          <div className="flex items-center gap-2">
            <Pill>{members.length} member(s)</Pill>
            <Pill>Feature 2</Pill>
          </div>
        </div>

        <Card>
          <CardTitle>Top picks</CardTitle>
          <div className="mt-2">
            <Muted>
              Average excludes skips. Higher votes ranks above ties.
            </Muted>
            {isRefreshing ? <div className="mt-1 text-sm text-white/55">Updating...</div> : null}
            {accessDenied ? (
              <div className="mt-2 text-sm text-white/70">
                Join this group first to view shared results.
              </div>
            ) : null}
          </div>

          {isLoadingRows ? (
            <div className="mt-4 space-y-2">
              <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-white/10" />
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse">
              <thead>
                <tr className="text-left text-xs text-white/60">
                  <th className="py-2 pr-3">Title</th>
                  <th className="py-2 pr-3">Avg</th>
                  <th className="py-2 pr-3">Votes</th>
                  <th className="py-2 pr-3">Skips</th>
                  {members.map((m) => (
                    <th key={m.id} className="py-2 pr-3">
                      {m.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoadingRows ? (
                  <tr>
                    <td className="py-3 text-sm text-white/70" colSpan={4 + members.length}>
                      Loading ratings...
                    </td>
                  </tr>
                ) : accessDenied ? (
                  <tr>
                    <td className="py-3 text-sm text-white/70" colSpan={4 + members.length}>
                      {activeMember
                        ? "You do not have permission to read shared ratings."
                        : "Join this group first to view shared ratings."}
                    </td>
                  </tr>
                ) : top.length === 0 ? (
                  <tr>
                    <td className="py-3 text-sm text-white/70" colSpan={4 + members.length}>
                      No ratings yet. Go rate a few titles.
                    </td>
                  </tr>
                ) : (
                  top.map((r) => (
                    <tr key={r.titleId} className="border-t border-white/10">
                      <td className="py-3 pr-3">
                        <TitleName titleId={r.titleId} />
                      </td>
                      <td className="py-3 pr-3 text-sm text-white/80">{starsText(r.avg)}</td>
                      <td className="py-3 pr-3 text-sm text-white/80">{r.votes}</td>
                      <td className="py-3 pr-3 text-sm text-white/80">{r.skips}</td>
                      {members.map((m) => (
                        <td key={m.id} className="py-3 pr-3 text-sm text-white/70">
                          {memberScore(perMember[m.id] ?? {}, r.titleId)}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => router.push(`/g/${groupId}/rate`)}>Keep rating</Button>
            <Button variant="secondary" onClick={() => router.push(`/g/${groupId}`)}>
              Lobby
            </Button>
          </div>
        </Card>

        <Card>
          <CardTitle>Next improvements</CardTitle>
          <div className="mt-2">
            <Muted>
              We can add swipe controls, real posters, streaming filters, and a database so friends can join from their phones.
            </Muted>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
