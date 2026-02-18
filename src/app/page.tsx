"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Button, Card, CardTitle, Muted, Pill } from "@/components/ui";
import { PopcornLogo } from "@/components/PopcornLogo";
import { deleteGroup, getMyGroups, leaveGroup, type MyGroupSummary } from "@/lib/groupStore";
import { isHostForGroup } from "@/lib/hostStore";
import { getActiveMember } from "@/lib/ratings";
import { listSavedGroups } from "@/lib/storage";

type GroupCard = {
  id: string;
  name: string;
  createdAt: string;
  isHost: boolean;
};

type ConfirmState = {
  groupId: string;
  groupName: string;
  action: "delete" | "leave";
} | null;

export default function Home() {
  const [groups, setGroups] = useState<GroupCard[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);
  const [isActing, setIsActing] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"info" | "success" | "error">("info");

  async function loadGroups() {
    setIsLoadingGroups(true);
    setMessage("");
    setMessageTone("info");

    const remote = await getMyGroups();
    const byId = new Map<string, GroupCard>();

    for (const group of remote.hosted) {
      byId.set(group.id, {
        id: group.id,
        name: group.name,
        createdAt: group.createdAt,
        isHost: true,
      });
    }

    for (const group of remote.joined) {
      if (byId.has(group.id)) continue;
      byId.set(group.id, {
        id: group.id,
        name: group.name,
        createdAt: group.createdAt,
        isHost: false,
      });
    }

    const local = listSavedGroups();
    for (const group of local) {
      if (byId.has(group.id)) continue;

      const host = isHostForGroup(group.id);
      const joined = Boolean(getActiveMember(group.id));
      if (!host && !joined) continue;

      byId.set(group.id, {
        id: group.id,
        name: group.name,
        createdAt: group.createdAt,
        isHost: host,
      });
    }

    const next = Array.from(byId.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    setGroups(next);

    if (remote.error === "network") {
      setMessage("Some groups may be missing while offline.");
      setMessageTone("info");
    } else if (remote.error === "forbidden") {
      setMessage("Some groups are hidden due to access rules.");
      setMessageTone("info");
    }

    setIsLoadingGroups(false);
  }

  useEffect(() => {
    void loadGroups();
  }, []);

  const hasGroups = useMemo(() => groups.length > 0, [groups.length]);

  async function onConfirmAction() {
    if (!confirmState || isActing) return;
    setIsActing(true);

    try {
      if (confirmState.action === "delete") {
        const result = await deleteGroup(confirmState.groupId);
        if (result.error !== "none") {
          setConfirmState(null);
          setMenuOpenFor(null);
          setMessageTone("error");
          setMessage(
            result.error === "forbidden"
              ? "You do not have permission to delete this group."
              : "Could not delete the group right now. Please try again."
          );
          return;
        }
        setGroups((current) => current.filter((g) => g.id !== confirmState.groupId));
        setMessageTone("success");
        setMessage(`Deleted "${confirmState.groupName}".`);
      } else {
        const result = await leaveGroup(confirmState.groupId);
        if (result.error !== "none") {
          setConfirmState(null);
          setMenuOpenFor(null);
          setMessageTone("error");
          setMessage(
            result.error === "forbidden"
              ? "You do not have permission to leave this group."
              : "Could not leave the group right now. Please try again."
          );
          return;
        }
        setGroups((current) => current.filter((g) => g.id !== confirmState.groupId));
        setMessageTone("success");
        setMessage(`Left "${confirmState.groupName}".`);
      }

      setConfirmState(null);
      setMenuOpenFor(null);
    } finally {
      setIsActing(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <Card>
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              <PopcornLogo className="h-14 w-14" />
            </div>

            <div className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight">ChooseAMovie</h1>
                <Pill>Movie night, solved</Pill>
              </div>

              <Muted>
                Build a group in seconds, invite everyone, and quickly discover something everyone is actually excited to watch.
              </Muted>

              <div className="flex flex-wrap gap-2 pt-1">
                <Link href="/create">
                  <Button>Create group</Button>
                </Link>
                <Button variant="secondary" disabled title="Join with code coming soon">
                  Join with code
                </Button>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between gap-3">
            <CardTitle>My groups</CardTitle>
          </div>

          {message ? (
            <div
              className={[
                "mt-3 rounded-xl border p-3 text-sm",
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

          {isLoadingGroups ? (
            <div className="mt-4 space-y-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-white/10" />
            </div>
          ) : !hasGroups ? (
            <div className="mt-3">
              <Muted>You have no groups yet. Create one to get started.</Muted>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {groups.map((group) => (
                <div
                  key={group.id}
                  className="rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <a href={`/g/${group.id}`} className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white hover:underline">
                        {group.name}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-white/60">
                        <span>{new Date(group.createdAt).toLocaleDateString()}</span>
                        <Pill>{group.isHost ? "Host" : "Joined"}</Pill>
                      </div>
                    </a>

                    <div className="relative">
                      <Button
                        variant="ghost"
                        aria-label="Group options"
                        onClick={() => setMenuOpenFor((current) => (current === group.id ? null : group.id))}
                      >
                        ...
                      </Button>

                      {menuOpenFor === group.id ? (
                        <div className="absolute right-0 z-20 mt-2 w-40 rounded-xl border border-white/10 bg-[rgb(var(--card-2))] p-1 shadow-lg">
                          <button
                            type="button"
                            className="w-full rounded-lg px-3 py-2 text-left text-sm text-white hover:bg-white/10"
                            onClick={() => {
                              setConfirmState({
                                groupId: group.id,
                                groupName: group.name,
                                action: group.isHost ? "delete" : "leave",
                              });
                            }}
                          >
                            {group.isHost ? "Delete group" : "Leave group"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="pt-1">
          <Link href="/create">
            <Button variant="secondary" className="w-full sm:w-auto">
              Create new group
            </Button>
          </Link>
        </div>
      </div>

      {confirmState ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[rgb(var(--card-2))] p-4 shadow-xl">
            <div className="text-lg font-semibold text-white">
              {confirmState.action === "delete" ? "Delete group?" : "Leave group?"}
            </div>
            <div className="mt-2 text-sm text-white/70">
              {confirmState.action === "delete"
                ? `This will remove ${confirmState.groupName} from your list and attempt to delete it for all members.`
                : `You will leave ${confirmState.groupName} and it will be removed from your list.`}
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="ghost" onClick={() => setConfirmState(null)} disabled={isActing}>
                Cancel
              </Button>
              <Button onClick={onConfirmAction} disabled={isActing}>
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
