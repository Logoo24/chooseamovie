"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { StateCard } from "@/components/StateCard";
import { Button, Card, CardTitle, Muted, Pill } from "@/components/ui";
import { getAuthSnapshot, subscribeAuthSnapshot, type AuthSnapshot } from "@/lib/authClient";
import { deleteGroup, getMyGroups, leaveGroup, type MyGroupSummary } from "@/lib/groupStore";

type GroupCard = {
  id: string;
  name: string;
  createdAt: string;
  isHost: boolean;
};

type ConfirmState =
  | {
      groupId: string;
      groupName: string;
      action: "delete" | "leave";
    }
  | null;

function GroupList({
  title,
  groups,
  onAction,
}: {
  title: string;
  groups: GroupCard[];
  onAction: (group: GroupCard) => void;
}) {
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
            <div
              key={`${group.isHost ? "host" : "joined"}:${group.id}`}
              className="rounded-xl border border-white/12 bg-black/28 p-3 transition duration-200 hover:border-white/22 hover:bg-black/35"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/g/${group.id}`} className="truncate text-sm font-semibold text-white hover:underline">
                    {group.name}
                  </Link>
                  <div className="mt-1 text-xs text-white/60">{new Date(group.createdAt).toLocaleDateString()}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Pill>{group.isHost ? "Host" : "Joined"}</Pill>
                  <Button variant="ghost" onClick={() => onAction(group)}>
                    {group.isHost ? "Delete" : "Leave"}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function GroupsPage() {
  const [auth, setAuth] = useState<AuthSnapshot>({
    userId: null,
    email: null,
    provider: null,
    hasSession: false,
    isAnonymous: false,
  });
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [hosted, setHosted] = useState<GroupCard[]>([]);
  const [joined, setJoined] = useState<GroupCard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">("info");
  const [error, setError] = useState<"none" | "auth_failed" | "network" | "forbidden">("none");

  useEffect(() => {
    let alive = true;

    void getAuthSnapshot().then((snapshot) => {
      if (!alive) return;
      setAuth(snapshot);
      setIsAuthReady(true);
    });

    const unsubscribe = subscribeAuthSnapshot((snapshot) => {
      setAuth(snapshot);
      setIsAuthReady(true);
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  const loadGroups = useCallback(async () => {
    setIsLoading(true);
    const remote = await getMyGroups();

    const hostedRemote: GroupCard[] = remote.hosted.map((g: MyGroupSummary) => ({
      id: g.id,
      name: g.name,
      createdAt: g.createdAt,
      isHost: true,
    }));
    const joinedRemote: GroupCard[] = remote.joined.map((g: MyGroupSummary) => ({
      id: g.id,
      name: g.name,
      createdAt: g.createdAt,
      isHost: false,
    }));

    setHosted(hostedRemote);
    setJoined(joinedRemote);
    setError(remote.error);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;
    if (!auth.hasSession || auth.isAnonymous) return;
    void loadGroups();
  }, [auth.hasSession, auth.isAnonymous, isAuthReady, loadGroups]);

  async function onConfirmAction() {
    if (!confirmState || isActing) return;
    setIsActing(true);

    try {
      if (confirmState.action === "delete") {
        const result = await deleteGroup(confirmState.groupId);
        if (result.error !== "none") {
          setMessageTone("error");
          setMessage(
            result.error === "forbidden"
              ? "You do not have permission to delete this group."
              : "Could not delete the group right now. Please try again."
          );
          setConfirmState(null);
          return;
        }
        setHosted((current) => current.filter((g) => g.id !== confirmState.groupId));
        setMessageTone("success");
        setMessage(`Deleted "${confirmState.groupName}".`);
      } else {
        const result = await leaveGroup(confirmState.groupId);
        if (result.error !== "none") {
          setMessageTone("error");
          setMessage(
            result.error === "forbidden"
              ? "You do not have permission to leave this group."
              : "Could not leave the group right now. Please try again."
          );
          setConfirmState(null);
          return;
        }
        setJoined((current) => current.filter((g) => g.id !== confirmState.groupId));
        setMessageTone("success");
        setMessage(`Left "${confirmState.groupName}".`);
      }

      setConfirmState(null);
    } finally {
      setIsActing(false);
    }
  }

  const hasGroups = useMemo(() => hosted.length > 0 || joined.length > 0, [hosted, joined]);
  const requiresSignIn = isAuthReady && (!auth.hasSession || auth.isAnonymous);

  if (requiresSignIn) {
    return (
      <AppShell>
        <StateCard
          title="Sign in to view your groups"
          description="You need to sign in to see groups you created or joined."
          actionHref="/signin?next=%2Fgroups"
          actionLabel="Sign in"
        />
      </AppShell>
    );
  }

  if (!isLoading && !hasGroups && error === "forbidden") {
    return (
      <AppShell>
        <StateCard
          title="Can't load groups"
          description="You don't have permission to view group memberships right now."
          actionHref="/create"
          actionLabel="Create group"
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My groups</h1>
          <div className="mt-1 text-sm text-white/66">Jump back into any group you host or joined.</div>
        </div>

        <div className="flex items-center justify-end">
          <Button variant="ghost" onClick={() => void loadGroups()} disabled={isLoading}>
            Refresh
          </Button>
        </div>

        {message ? (
          <div
            className={[
              "rounded-xl border p-3 text-sm",
              messageTone === "error"
                ? "border-red-400/40 bg-red-500/10 text-red-100"
                : messageTone === "success"
                  ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                  : "border-white/10 bg-white/5 text-white/70",
            ].join(" ")}
          >
            {message}
          </div>
        ) : null}

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
        ) : !hasGroups ? (
          <Card>
            <CardTitle>No groups yet</CardTitle>
            <div className="mt-2">
              <Muted>You have not joined or created any groups yet.</Muted>
            </div>
            <div className="mt-4">
              <Link href="/create">
                <Button>Create a group now</Button>
              </Link>
            </div>
          </Card>
        ) : (
          <>
            <GroupList
              title="Hosted by you"
              groups={hosted}
              onAction={(group) =>
                setConfirmState({
                  groupId: group.id,
                  groupName: group.name,
                  action: "delete",
                })
              }
            />
            <GroupList
              title="Joined groups"
              groups={joined}
              onAction={(group) =>
                setConfirmState({
                  groupId: group.id,
                  groupName: group.name,
                  action: "leave",
                })
              }
            />
          </>
        )}
      </div>

      {confirmState ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-white/14 bg-[rgb(var(--card-2))]/95 p-4 shadow-[0_24px_54px_rgba(0,0,0,0.45)] backdrop-blur">
            <div className="text-lg font-semibold text-white">
              {confirmState.action === "delete" ? "Delete group?" : "Leave group?"}
            </div>
            <div className="mt-2 text-sm text-white/70">
              {confirmState.action === "delete"
                ? `This will delete ${confirmState.groupName} for you as host. Joined members may still keep access from their own history.`
                : `You will leave ${confirmState.groupName} and it will be removed from your list.`}
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="ghost" onClick={() => setConfirmState(null)} disabled={isActing}>
                Cancel
              </Button>
              <Button onClick={() => void onConfirmAction()} disabled={isActing}>
                {isActing
                  ? "Working..."
                  : confirmState.action === "delete"
                    ? "Delete group"
                    : "Leave group"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
