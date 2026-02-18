"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { StorageModeBanner } from "@/components/StorageModeBanner";
import { Button, Card, CardTitle, Input, Muted, Pill } from "@/components/ui";
import { createGroup } from "@/lib/groupStore";
import { markHostForGroup } from "@/lib/hostStore";
import { createGroupId, type GroupSettings } from "@/lib/storage";

function parseShortlist(raw: string) {
  // Split on newlines or commas, trim, remove empties, unique, limit 10
  const items = raw
    .split(/\n|,/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const unique: string[] = [];
  for (const it of items) {
    if (!unique.some((x) => x.toLowerCase() === it.toLowerCase())) unique.push(it);
    if (unique.length >= 10) break;
  }
  return unique;
}

export default function CreateGroupPage() {
  const router = useRouter();

  // rotating placeholder for group name
  const placeholders = useMemo(
    () => ["Movie night", "Family movie night", "What movie should we watch?", "Roommates"],
    []
  );
  const [phIndex, setPhIndex] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => {
      setPhIndex((i) => (i + 1) % placeholders.length);
    }, 2000);
    return () => window.clearInterval(t);
  }, [placeholders.length]);

  const [groupName, setGroupName] = useState("");

  const [settings, setSettings] = useState<GroupSettings>({
    contentType: "movies",
    allowG: true,
    allowPG: true,
    allowPG13: true,
    allowR: true, // R checked by default (changed)

    ratingMode: "unlimited",
    shortlistItems: [],
  });

  const [shortlistDraft, setShortlistDraft] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // keep shortlistItems synced when in shortlist mode
  useEffect(() => {
    if (settings.ratingMode !== "shortlist") return;
    const parsed = parseShortlist(shortlistDraft);
    setSettings((s) => ({ ...s, shortlistItems: parsed }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shortlistDraft, settings.ratingMode]);

  const atLeastOneRating =
    settings.allowG || settings.allowPG || settings.allowPG13 || settings.allowR;

  const shortlistOk =
    settings.ratingMode === "unlimited" ? true : settings.shortlistItems.length >= 2;

  const canCreate = useMemo(() => {
    const nameOk = groupName.trim().length >= 2;
    return nameOk && atLeastOneRating && shortlistOk;
  }, [groupName, atLeastOneRating, shortlistOk]);

  async function onCreate() {
    if (!canCreate || isCreating) return;

    const id = createGroupId();
    setIsCreating(true);
    try {
      await createGroup({
        id,
        name: groupName.trim(),
        createdAt: new Date().toISOString(),
        schemaVersion: 1,
        settings,
      });
      markHostForGroup(id);
      router.push(`/g/${id}`);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Create a group</h1>
            <div className="mt-1 text-sm text-white/60">Classic movie-night vibe.</div>
          </div>
          <Pill>Setup</Pill>
        </div>

        <StorageModeBanner />

        <Card>
          <CardTitle>Group name</CardTitle>
          <div className="mt-3 space-y-2">
            <Input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder={placeholders[phIndex]}
              autoComplete="off"
              inputMode="text"
            />
            <Muted>Use something short. You can always create another group later.</Muted>
          </div>
        </Card>

        <Card>
          <CardTitle>Rating mode</CardTitle>
          <div className="mt-3 space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() =>
                  setSettings((s) => ({ ...s, ratingMode: "unlimited", shortlistItems: [] }))
                }
                className={[
                  "rounded-2xl border p-4 text-left transition",
                  settings.ratingMode === "unlimited"
                    ? "border-[rgb(var(--yellow))]/40 bg-[rgb(var(--card-2))] shadow-sm"
                    : "border-white/10 bg-white/5 hover:bg-white/10",
                ].join(" ")}
              >
                <div className="text-sm font-semibold">Unlimited</div>
                <div className="mt-1 text-sm text-white/60">
                  Everyone keeps rating new titles until they stop.
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, ratingMode: "shortlist" }))}
                className={[
                  "rounded-2xl border p-4 text-left transition",
                  settings.ratingMode === "shortlist"
                    ? "border-[rgb(var(--yellow))]/40 bg-[rgb(var(--card-2))] shadow-sm"
                    : "border-white/10 bg-white/5 hover:bg-white/10",
                ].join(" ")}
              >
                <div className="text-sm font-semibold">Shortlist</div>
                <div className="mt-1 text-sm text-white/60">
                  Add up to 10 titles, everyone rates only those.
                </div>
              </button>
            </div>

            {settings.ratingMode === "shortlist" ? (
              <div className="space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-semibold text-white">Shortlist titles</div>
                <div className="text-sm text-white/60">
                  Enter 2 to 10 titles. Separate by new lines or commas.
                </div>

                <textarea
                  value={shortlistDraft}
                  onChange={(e) => setShortlistDraft(e.target.value)}
                  placeholder={"Interstellar\nThe Princess Bride\nToy Story"}
                  className="mt-2 w-full rounded-xl border border-white/10 bg-[rgb(var(--card))] p-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-[rgb(var(--yellow))]/60 focus:ring-2 focus:ring-[rgb(var(--yellow))]/20"
                  rows={5}
                />

                <div className="flex flex-wrap items-center gap-2 text-sm text-white/65">
                  <Pill>{settings.shortlistItems.length} / 10</Pill>
                  {settings.shortlistItems.length > 0 ? (
                    <span>
                      Using:{" "}
                      <span className="text-white/80">
                        {settings.shortlistItems.slice(0, 3).join(", ")}
                        {settings.shortlistItems.length > 3 ? "…" : ""}
                      </span>
                    </span>
                  ) : null}
                </div>

                {!shortlistOk ? (
                  <div className="rounded-xl border border-[rgb(var(--red))]/40 bg-[rgb(var(--red))]/10 p-3 text-sm text-white">
                    Add at least 2 titles for Shortlist mode.
                  </div>
                ) : null}
              </div>
            ) : null}
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
                <div className="mt-1 text-sm text-white/60">Faster decisions.</div>
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
                <div className="mt-1 text-sm text-white/60">Include series (later).</div>
              </button>
            </div>
          </div>
        </Card>

        <Card>
          <CardTitle>Allowed ratings</CardTitle>
          <div className="mt-3 space-y-3">
            <Muted>Pick what your group is comfortable with.</Muted>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { key: "allowG", label: "G", desc: "General audiences" },
                { key: "allowPG", label: "PG", desc: "Parental guidance" },
                { key: "allowPG13", label: "PG-13", desc: "Teens and up" },
                { key: "allowR", label: "R", desc: "Restricted" },
              ].map((opt) => (
                <label
                  key={opt.key}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/10"
                >
                  <div>
                    <div className="text-sm font-semibold">{opt.label}</div>
                    <div className="text-sm text-white/60">{opt.desc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={(settings as any)[opt.key]}
                    onChange={(e) =>
                      setSettings((s) => ({ ...(s as any), [opt.key]: e.target.checked }))
                    }
                    className="h-5 w-5 accent-[rgb(var(--yellow))]"
                  />
                </label>
              ))}
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
              <Muted>This creates your group and takes you to the lobby.</Muted>
            </div>
            <div className="mt-4 flex gap-2">
              <Button onClick={onCreate} disabled={!canCreate || isCreating}>
                {isCreating ? "Creating..." : "Create group"}
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setGroupName("");
                  setShortlistDraft("");
                  setSettings({
                    contentType: "movies",
                    allowG: true,
                    allowPG: true,
                    allowPG13: true,
                    allowR: true,
                    ratingMode: "unlimited",
                    shortlistItems: [],
                  });
                }}
              >
                Reset
              </Button>
            </div>
          </Card>

          <Card>
            <CardTitle>Note</CardTitle>
            <div className="mt-2">
              <Muted>
                Until we add a database, groups and ratings are saved on this device only.
              </Muted>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
