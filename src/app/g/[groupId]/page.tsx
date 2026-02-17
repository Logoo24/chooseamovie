"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button, Card, CardTitle, Muted, Pill } from "@/components/ui";
import { useToast } from "@/components/useToast";
import { loadGroup, type Group } from "@/lib/storage";

function ratingLabel(group: Group) {
  const allowed: string[] = [];
  if (group.settings.allowG) allowed.push("G");
  if (group.settings.allowPG) allowed.push("PG");
  if (group.settings.allowPG13) allowed.push("PG-13");
  if (group.settings.allowR) allowed.push("R");
  return allowed.join(", ");
}

export default function GroupLobbyPage() {
  const params = useParams<{ groupId: string }>();
  const groupId = params.groupId;

  const [group, setGroup] = useState<Group | null>(null);
  const { show, Toast } = useToast();

  useEffect(() => {
    setGroup(loadGroup(groupId));
  }, [groupId]);

  const inviteLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/g/${groupId}`;
  }, [groupId]);

  if (!group) {
    return (
      <AppShell>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Group not found</h1>
            <Pill>Local only</Pill>
          </div>
          <Card>
            <CardTitle>Why this happened</CardTitle>
            <div className="mt-2">
              <Muted>
                Right now, groups are saved to the browser that created them. Later we will
                add a database so invite links work across phones.
              </Muted>
            </div>
            <div className="mt-4">
              <a href="/create">
                <Button>Create a group</Button>
              </a>
            </div>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {Toast}
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{group.name}</h1>
            <div className="mt-1 text-sm text-white/60">Lobby</div>
          </div>
          <Pill>{group.settings.contentType === "movies" ? "Movies" : "Movies + Shows"}</Pill>
        </div>

        <Card>
          <CardTitle>Invite link</CardTitle>
          <div className="mt-3 space-y-3">
            <div className="rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3 text-sm text-white/85">
              <div className="break-all">{inviteLink}</div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={async () => {
                  await navigator.clipboard.writeText(inviteLink);
                  show("Invite link copied");
                }}
              >
                Copy link
              </Button>

              <Button
                variant="secondary"
                onClick={async () => {
                  if (navigator.share) {
                    try {
                      await navigator.share({ title: "ChooseAMovie", url: inviteLink });
                    } catch {
                      // user canceled
                    }
                  } else {
                    await navigator.clipboard.writeText(inviteLink);
                    show("Copied (share not supported)");
                  }
                }}
              >
                Share
              </Button>
            </div>

            <Muted>
              Note: In Feature 1, this link is mainly for you. Cross-device joining will come when we add a database.
            </Muted>
          </div>
        </Card>

        <Card>
          <CardTitle>Settings</CardTitle>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3">
              <div className="text-sm font-semibold">Content</div>
              <div className="mt-1 text-sm text-white/60">
                {group.settings.contentType === "movies" ? "Movies only" : "Movies and shows"}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3">
              <div className="text-sm font-semibold">Allowed ratings</div>
              <div className="mt-1 text-sm text-white/60">{ratingLabel(group)}</div>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>Next step</CardTitle>
          <div className="mt-2">
            <Muted>
              Feature 2 will add the rating screen and start collecting ratings.
            </Muted>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="/create">
              <Button variant="ghost">Create another group</Button>
            </a>
            <a href={`/g/${groupId}/rate`}>
              <Button variant="secondary">Go to rating (next)</Button>
            </a>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
