"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button, Card, CardTitle, Input, Muted, ToggleRow, Pill } from "@/components/ui";
import { createGroupId, saveGroup, type GroupSettings } from "@/lib/storage";

export default function CreateGroupPage() {
  const router = useRouter();

  const [groupName, setGroupName] = useState("");
  const [settings, setSettings] = useState<GroupSettings>({
    contentType: "movies",
    allowG: true,
    allowPG: true,
    allowPG13: true,
    allowR: false,
  });

  const atLeastOneRating =
    settings.allowG || settings.allowPG || settings.allowPG13 || settings.allowR;

  const canCreate = useMemo(() => {
    const nameOk = groupName.trim().length >= 2;
    return nameOk && atLeastOneRating;
  }, [groupName, atLeastOneRating]);

  function onCreate() {
    if (!canCreate) return;

    const id = createGroupId();
    saveGroup({
      id,
      name: groupName.trim(),
      createdAt: new Date().toISOString(),
      settings,
    });

    router.push(`/g/${id}`);
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Create a group</h1>
            <div className="mt-1 text-sm text-white/60">
              Dark mode, classic movie-night vibe.
            </div>
          </div>
          <Pill>Feature 1</Pill>
        </div>

        <Card>
          <CardTitle>Group name</CardTitle>
          <div className="mt-3 space-y-2">
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Movie Night"
              autoComplete="off"
              inputMode="text"
            />
            <Muted>Use something simple, like “Friday Night” or “Family Night.”</Muted>
          </div>
        </Card>

        <Card>
          <CardTitle>Content</CardTitle>
          <div className="mt-3 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, contentType: "movies" }))}
                className={[
                  "rounded-2xl border p-4 text-left transition",
                  settings.contentType === "movies"
                    ? "border-[rgb(var(--yellow))]/40 bg-[rgb(var(--card-2))] shadow-sm"
                    : "border-white/10 bg-white/5 hover:bg-white/10",
                ].join(" ")}
              >
                <div className="text-sm font-semibold">Movies only</div>
                <div className="mt-1 text-sm text-white/60">
                  Focus on films, faster decisions.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, contentType: "movies_and_shows" }))}
                className={[
                  "rounded-2xl border p-4 text-left transition",
                  settings.contentType === "movies_and_shows"
                    ? "border-[rgb(var(--yellow))]/40 bg-[rgb(var(--card-2))] shadow-sm"
                    : "border-white/10 bg-white/5 hover:bg-white/10",
                ].join(" ")}
              >
                <div className="text-sm font-semibold">Movies and shows</div>
                <div className="mt-1 text-sm text-white/60">
                  Include series (later feature).
                </div>
              </button>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>Allowed ratings</CardTitle>
          <div className="mt-3 space-y-3">
            <Muted>
              Pick what your group is comfortable with. You must allow at least one.
            </Muted>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/10">
                <div>
                  <div className="text-sm font-semibold">G</div>
                  <div className="text-sm text-white/60">General audiences</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.allowG}
                  onChange={(e) => setSettings((s) => ({ ...s, allowG: e.target.checked }))}
                  className="h-5 w-5 accent-[rgb(var(--yellow))]"
                />
              </label>

              <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/10">
                <div>
                  <div className="text-sm font-semibold">PG</div>
                  <div className="text-sm text-white/60">Parental guidance</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.allowPG}
                  onChange={(e) => setSettings((s) => ({ ...s, allowPG: e.target.checked }))}
                  className="h-5 w-5 accent-[rgb(var(--yellow))]"
                />
              </label>

              <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/10">
                <div>
                  <div className="text-sm font-semibold">PG-13</div>
                  <div className="text-sm text-white/60">Teens and up</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.allowPG13}
                  onChange={(e) => setSettings((s) => ({ ...s, allowPG13: e.target.checked }))}
                  className="h-5 w-5 accent-[rgb(var(--yellow))]"
                />
              </label>

              <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/10">
                <div>
                  <div className="text-sm font-semibold">R</div>
                  <div className="text-sm text-white/60">Restricted</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.allowR}
                  onChange={(e) => setSettings((s) => ({ ...s, allowR: e.target.checked }))}
                  className="h-5 w-5 accent-[rgb(var(--yellow))]"
                />
              </label>
            </div>

            {!atLeastOneRating ? (
              <div className="rounded-xl border border-[rgb(var(--red))]/40 bg-[rgb(var(--red))]/10 p-3 text-sm text-white">
                Please allow at least one rating.
              </div>
            ) : null}
          </div>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          <Card>
            <CardTitle>Ready?</CardTitle>
            <div className="mt-2">
              <Muted>
                This creates a group on this device. The lobby page will show your invite link.
              </Muted>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={onCreate} disabled={!canCreate}>
                Create group
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setGroupName("");
                  setSettings({
                    contentType: "movies",
                    allowG: true,
                    allowPG: true,
                    allowPG13: true,
                    allowR: false,
                  });
                }}
              >
                Reset
              </Button>
            </div>
          </Card>

          <Card>
            <CardTitle>Next</CardTitle>
            <div className="mt-2">
              <Muted>Feature 2 will add rating cards and saved ratings.</Muted>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
