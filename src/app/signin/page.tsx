"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Button, Card, CardTitle, Muted, Pill } from "@/components/ui";
import { deleteGroup, getMyGroups, leaveGroup } from "@/lib/groupStore";
import { isHostForGroup } from "@/lib/hostStore";
import { getActiveMember } from "@/lib/ratings";
import { listSavedGroups } from "@/lib/storage";

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

export default function SignInPage() {
  const [groups, setGroups] = useState<GroupCard[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);
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

    setGroups(Array.from(byId.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));

    if (remote.error === "network") {
      setMessage("Some groups may be missing while offline.");
      setMessageTone("info");
    } else if (remote.error === "forbidden") {
      setMessage("Some groups are hidden due to access rules.");
      setMessageTone("info");
    } else if (remote.error === "auth_failed") {
      setMessage("Could not load cloud groups right now. Showing local groups on this device.");
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
    } finally {
      setIsActing(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <Card>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Sign in (coming soon)</h1>
              <Pill>Temporary access</Pill>
            </div>
            <Muted>
              Sign-in support is on the roadmap. Until then, you can still jump back into groups you host or joined.
            </Muted>
            <div className="flex flex-wrap gap-2 pt-1">
              <Link href="/" className="inline-flex items-center rounded-lg px-1 py-1 text-sm text-white/75 hover:text-white">
                Back home
              </Link>
              <Link href="/create">
                <Button>Create new group</Button>
              </Link>
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
                  className="rounded-xl border border-white/12 bg-black/28 p-3 transition duration-200 hover:border-white/20 hover:bg-black/35"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/g/${group.id}`} className="truncate text-sm font-semibold text-white hover:underline">
                        {group.name}
                      </Link>
                      <div className="mt-1 flex items-center gap-2 text-xs text-white/60">
                        <span>{new Date(group.createdAt).toLocaleDateString()}</span>
                        <Pill>{group.isHost ? "Host" : "Joined"}</Pill>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/g/${group.id}`}
                        className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/15"
                      >
                        Visit
                      </Link>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          setConfirmState({
                            groupId: group.id,
                            groupName: group.name,
                            action: group.isHost ? "delete" : "leave",
                          })
                        }
                      >
                        {group.isHost ? "Delete" : "Leave"}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {confirmState ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-white/14 bg-[rgb(var(--card-2))]/95 p-4 shadow-[0_24px_54px_rgba(0,0,0,0.45)] backdrop-blur">
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
