"use client";

import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Button, Card, CardTitle, Input, Muted, Pill } from "@/components/ui";
import { createGroup } from "@/lib/groupStore";
import { markHostForGroup } from "@/lib/hostStore";
import { getHostDisplayName, setHostDisplayName } from "@/lib/hostProfileStore";
import { createGroupId, type GroupSettings } from "@/lib/storage";

type Step = 0 | 1 | 2;

export default function CreateGroupPage() {
  const router = useRouter();

  const placeholders = useMemo(
    () => ["Movie night", "Family movie night", "What should we watch?", "Roommates"],
    []
  );
  const [phIndex, setPhIndex] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => {
      setPhIndex((i) => (i + 1) % placeholders.length);
    }, 2000);
    return () => window.clearInterval(t);
  }, [placeholders.length]);

  const [step, setStep] = useState<Step>(0);
  const [hostName, setHostName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [settings, setSettings] = useState<GroupSettings>({
    contentType: "movies",
    allowG: true,
    allowPG: true,
    allowPG13: true,
    allowR: true,
    allow_members_invite_link: false,
    ratingMode: "unlimited",
    shortlistItems: [],
  });
  const [isCreating, setIsCreating] = useState(false);

  const ratingOptions: Array<{
    key: "allowG" | "allowPG" | "allowPG13" | "allowR";
    label: string;
    desc: string;
  }> = [
    { key: "allowG", label: "G", desc: "General audiences" },
    { key: "allowPG", label: "PG", desc: "Parental guidance" },
    { key: "allowPG13", label: "PG-13", desc: "Teens and up" },
    { key: "allowR", label: "R", desc: "Restricted" },
  ];

  useEffect(() => {
    setHostName(getHostDisplayName());
  }, []);

  const isCustomListMode = settings.ratingMode === "shortlist";
  const atLeastOneRating =
    settings.allowG || settings.allowPG || settings.allowPG13 || settings.allowR;

  const canGoStep2 = hostName.trim().length >= 2;
  const canGoStep3 = groupName.trim().length >= 2;
  const canCreate = isCustomListMode ? true : atLeastOneRating;

  function onCardKeyDown(event: KeyboardEvent<HTMLDivElement>, onActivate: () => void) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate();
    }
  }

  function goToNextStep() {
    if (step === 0 && !canGoStep2) return;
    if (step === 1 && !canGoStep3) return;
    setStep((s) => (s === 2 ? 2 : ((s + 1) as Step)));
  }

  async function onCreate() {
    if (!canCreate || isCreating) return;

    const id = createGroupId();
    setIsCreating(true);
    try {
      setHostDisplayName(hostName);

      await createGroup({
        id,
        name: groupName.trim(),
        createdAt: new Date().toISOString(),
        schemaVersion: 1,
        settings,
      });

      markHostForGroup(id);

      if (settings.ratingMode === "shortlist") {
        router.push(`/g/${id}/custom-list?from=create`);
      } else {
        router.push(`/g/${id}`);
      }
    } finally {
      setIsCreating(false);
    }
  }

  const stepTitle = step === 0 ? "Your name" : step === 1 ? "Name your group" : "Set up your chooser";

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Create a group</h1>
            <div className="mt-1 text-sm text-white/60">Step {step + 1} of 3: {stepTitle}</div>
          </div>
          <Pill>Setup wizard</Pill>
        </div>

        <div className="overflow-hidden rounded-2xl">
          <div
            className="flex w-[300%] transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${step * (100 / 3)}%)` }}
          >
            <div className="w-full pr-0 sm:pr-2">
              <Card>
                <CardTitle>Your name</CardTitle>
                <div className="mt-3 space-y-2">
                  <Input
                    value={hostName}
                    onChange={(e) => setHostName(e.target.value)}
                    placeholder="Your name"
                    autoComplete="off"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canGoStep2) {
                        e.preventDefault();
                        goToNextStep();
                      }
                    }}
                  />
                  <Muted>This is your host display name. It stays on this device for now.</Muted>
                  <div className="pt-2">
                    <Button onClick={goToNextStep} disabled={!canGoStep2}>
                      Continue
                    </Button>
                  </div>
                </div>
              </Card>
            </div>

            <div className="w-full px-0 sm:px-2">
              <Card>
                <CardTitle>Name your group</CardTitle>
                <div className="mt-3 space-y-2">
                  <Input
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder={placeholders[phIndex]}
                    autoComplete="off"
                    inputMode="text"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && canGoStep3) {
                        e.preventDefault();
                        goToNextStep();
                      }
                    }}
                  />
                  <Muted>Choose a clear name everyone will recognize.</Muted>
                  <div className="pt-2">
                    <Button onClick={goToNextStep} disabled={!canGoStep3}>
                      Continue
                    </Button>
                  </div>
                </div>
              </Card>
            </div>

            <div className="w-full pl-0 sm:pl-2">
              <Card>
                <CardTitle>Choose mode</CardTitle>
                <div className="mt-3 space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSettings((s) => ({ ...s, ratingMode: "unlimited", shortlistItems: [] }))}
                      onKeyDown={(event) =>
                        onCardKeyDown(event, () =>
                          setSettings((s) => ({ ...s, ratingMode: "unlimited", shortlistItems: [] }))
                        )
                      }
                      className={[
                        "rounded-2xl border p-4 text-left transition focus:outline-none focus-visible:border-[rgb(var(--yellow))]/60 focus-visible:ring-2 focus-visible:ring-[rgb(var(--yellow))]/20",
                        settings.ratingMode === "unlimited"
                          ? "border-[rgb(var(--yellow))]/40 bg-[rgb(var(--card-2))] shadow-sm"
                          : "border-white/10 bg-white/5 hover:bg-white/10",
                      ].join(" ")}
                    >
                      <div className="text-sm font-semibold">Endless mode</div>
                      <div className="mt-1 text-sm text-white/60">
                        Keep rating options until your group is ready to pick.
                      </div>
                    </div>

                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSettings((s) => ({ ...s, ratingMode: "shortlist" }))}
                      onKeyDown={(event) =>
                        onCardKeyDown(event, () => setSettings((s) => ({ ...s, ratingMode: "shortlist" })))
                      }
                      className={[
                        "rounded-2xl border p-4 text-left transition focus:outline-none focus-visible:border-[rgb(var(--yellow))]/60 focus-visible:ring-2 focus-visible:ring-[rgb(var(--yellow))]/20",
                        settings.ratingMode === "shortlist"
                          ? "border-[rgb(var(--yellow))]/40 bg-[rgb(var(--card-2))] shadow-sm"
                          : "border-white/10 bg-white/5 hover:bg-white/10",
                      ].join(" ")}
                    >
                      <div className="text-sm font-semibold">Custom list</div>
                      <div className="mt-1 text-sm text-white/60">
                        Build a specific list of titles that everyone rates.
                      </div>
                    </div>
                  </div>

                  {settings.ratingMode === "unlimited" ? (
                    <div className="space-y-3">
                      <Card>
                        <CardTitle>Content</CardTitle>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => setSettings((s) => ({ ...s, contentType: "movies" }))}
                            onKeyDown={(event) =>
                              onCardKeyDown(event, () =>
                                setSettings((s) => ({ ...s, contentType: "movies" }))
                              )
                            }
                            className={[
                              "rounded-2xl border p-4 text-left transition focus:outline-none focus-visible:border-[rgb(var(--yellow))]/60 focus-visible:ring-2 focus-visible:ring-[rgb(var(--yellow))]/20",
                              settings.contentType === "movies"
                                ? "border-[rgb(var(--yellow))]/40 bg-[rgb(var(--card-2))] shadow-sm"
                                : "border-white/10 bg-white/5 hover:bg-white/10",
                            ].join(" ")}
                          >
                            <div className="text-sm font-semibold">Movies only</div>
                          </div>

                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => setSettings((s) => ({ ...s, contentType: "movies_and_shows" }))}
                            onKeyDown={(event) =>
                              onCardKeyDown(event, () =>
                                setSettings((s) => ({ ...s, contentType: "movies_and_shows" }))
                              )
                            }
                            className={[
                              "rounded-2xl border p-4 text-left transition focus:outline-none focus-visible:border-[rgb(var(--yellow))]/60 focus-visible:ring-2 focus-visible:ring-[rgb(var(--yellow))]/20",
                              settings.contentType === "movies_and_shows"
                                ? "border-[rgb(var(--yellow))]/40 bg-[rgb(var(--card-2))] shadow-sm"
                                : "border-white/10 bg-white/5 hover:bg-white/10",
                            ].join(" ")}
                          >
                            <div className="text-sm font-semibold">Movies + Shows</div>
                          </div>
                        </div>
                      </Card>

                      <Card>
                        <CardTitle>Allowed ratings</CardTitle>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          {ratingOptions.map((opt) => (
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
                                checked={settings[opt.key]}
                                onChange={(e) => setSettings((s) => ({ ...s, [opt.key]: e.target.checked }))}
                                className="h-5 w-5 accent-[rgb(var(--yellow))]"
                              />
                            </label>
                          ))}
                        </div>

                        {!atLeastOneRating ? (
                          <div className="mt-3 rounded-xl border border-[rgb(var(--red))]/40 bg-[rgb(var(--red))]/10 p-3 text-sm text-white">
                            Select at least one rating option.
                          </div>
                        ) : null}
                      </Card>

                      <Card>
                        <CardTitle>Categories</CardTitle>
                        <div className="mt-2">
                          <Muted>Coming soon: genre/category preferences for better recommendations.</Muted>
                        </div>
                      </Card>

                      <Card>
                        <CardTitle>Streaming services</CardTitle>
                        <div className="mt-2">
                          <Muted>Coming soon: filter by where your group can watch right now.</Muted>
                        </div>
                      </Card>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                      Filters are hidden in Custom list mode because you will pick the exact titles next.
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </div>

        <Card>
          <CardTitle>Navigation</CardTitle>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="ghost"
              onClick={() => setStep((s) => (s === 0 ? 0 : ((s - 1) as Step)))}
              disabled={step === 0 || isCreating}
            >
              Back
            </Button>

            {step < 2 ? (
              <Button
                onClick={goToNextStep}
                disabled={(step === 0 && !canGoStep2) || (step === 1 && !canGoStep3) || isCreating}
              >
                Next
              </Button>
            ) : (
              <Button onClick={onCreate} disabled={!canCreate || isCreating}>
                {isCreating ? "Creating..." : "Create group"}
              </Button>
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
