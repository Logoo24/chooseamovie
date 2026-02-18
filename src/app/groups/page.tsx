"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { StateCard } from "@/components/StateCard";
import { Button, Card, CardTitle, Muted, Pill } from "@/components/ui";
import { getMyGroups, type MyGroupSummary } from "@/lib/groupStore";
import { isHostForGroup } from "@/lib/hostStore";
import { getActiveMember } from "@/lib/ratings";
import { listSavedGroups } from "@/lib/storage";

type GroupCard = {
  id: string;
  name: string;
  createdAt: string;
  role: "host" | "joined";
};

function GroupList({ title, groups }: { title: string; groups: GroupCard[] }) {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      {groups.length === 0 ? (
        <div className="mt-2">
          <Muted>No groups here yet.</Muted>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {groups.map((group) => (
            <a
              key={`${group.role}:${group.id}`}
              href={`/g/${group.id}`}
              className="block rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3 hover:bg-white/10"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{group.name}</div>
                  <div className="mt-1 text-xs text-white/60">
                    {new Date(group.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <Pill>{group.role === "host" ? "Host" : "Joined"}</Pill>
              </div>
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function GroupsPage() {
  const [hosted, setHosted] = useState<GroupCard[]>([]);
  const [joined, setJoined] = useState<GroupCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<"none" | "auth_failed" | "network" | "forbidden">("none");

  useEffect(() => {
    let alive = true;
    setIsLoading(true);

    (async () => {
      const remote = await getMyGroups();
      if (!alive) return;

      const hostedRemote: GroupCard[] = remote.hosted.map((g: MyGroupSummary) => ({
        id: g.id,
        name: g.name,
        createdAt: g.createdAt,
        role: "host",
      }));
      const joinedRemote: GroupCard[] = remote.joined.map((g: MyGroupSummary) => ({
        id: g.id,
        name: g.name,
        createdAt: g.createdAt,
        role: "joined",
      }));

      if (hostedRemote.length > 0 || joinedRemote.length > 0) {
        setHosted(hostedRemote);
        setJoined(joinedRemote);
        setError(remote.error);
        setIsLoading(false);
        return;
      }

      const local = listSavedGroups();
      const hostedLocal: GroupCard[] = [];
      const joinedLocal: GroupCard[] = [];

      for (const group of local) {
        if (isHostForGroup(group.id)) {
          hostedLocal.push({
            id: group.id,
            name: group.name,
            createdAt: group.createdAt,
            role: "host",
          });
        } else if (getActiveMember(group.id)) {
          joinedLocal.push({
            id: group.id,
            name: group.name,
            createdAt: group.createdAt,
            role: "joined",
          });
        }
      }

      setHosted(hostedLocal);
      setJoined(joinedLocal);
      setError(remote.error);
      setIsLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const hasGroups = useMemo(() => hosted.length > 0 || joined.length > 0, [hosted, joined]);

  if (!isLoading && !hasGroups && error === "forbidden") {
    return (
      <AppShell>
        <StateCard
          title="My groups"
          badge="Access limited"
          description="You do not have permission to read group memberships right now."
          actionHref="/create"
          actionLabel="Create new group"
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">My groups</h1>
            <div className="mt-1 text-sm text-white/60">Jump back into any group you host or joined.</div>
          </div>
          <a href="/create">
            <Button>Create new group</Button>
          </a>
        </div>

        {error === "network" ? (
          <Card>
            <CardTitle>Connection issue</CardTitle>
            <div className="mt-2">
              <Muted>Showing what is available right now. Some groups may not appear until reconnect.</Muted>
            </div>
          </Card>
        ) : null}

        {isLoading ? (
          <Card>
            <CardTitle>Loading groups</CardTitle>
            <div className="mt-3 space-y-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-white/10" />
            </div>
          </Card>
        ) : (
          <>
            <GroupList title="Hosted by you" groups={hosted} />
            <GroupList title="Joined groups" groups={joined} />
          </>
        )}
      </div>
    </AppShell>
  );
}
