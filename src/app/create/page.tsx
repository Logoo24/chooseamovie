"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

  const canCreate = useMemo(() => {
    const nameOk = groupName.trim().length >= 2;
    const atLeastOneRating =
      settings.allowG || settings.allowPG || settings.allowPG13 || settings.allowR;
    return nameOk && atLeastOneRating;
  }, [groupName, settings]);

  function onCreate() {
    if (!canCreate) return;

    const id = createGroupId();
    const group = {
      id,
      name: groupName.trim(),
      createdAt: new Date().toISOString(),
      settings,
    };

    saveGroup(group);
    router.push(`/g/${id}`);
  }

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-xl space-y-6">
        <h1 className="text-2xl font-semibold">Create a group</h1>

        <div className="space-y-2">
          <label className="block text-sm font-medium">Group name</label>
          <input
            className="w-full rounded border px-3 py-2"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Movie Night"
          />
          <p className="text-sm text-gray-600">At least 2 characters.</p>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Content type</div>
          <div className="flex gap-3">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="contentType"
                checked={settings.contentType === "movies"}
                onChange={() => setSettings((s) => ({ ...s, contentType: "movies" }))}
              />
              Movies only
            </label>

            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="contentType"
                checked={settings.contentType === "movies_and_shows"}
                onChange={() =>
                  setSettings((s) => ({ ...s, contentType: "movies_and_shows" }))
                }
              />
              Movies and shows
            </label>
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Allowed ratings</div>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.allowG}
                onChange={(e) => setSettings((s) => ({ ...s, allowG: e.target.checked }))}
              />
              G
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.allowPG}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, allowPG: e.target.checked }))
                }
              />
              PG
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.allowPG13}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, allowPG13: e.target.checked }))
                }
              />
              PG-13
            </label>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.allowR}
                onChange={(e) => setSettings((s) => ({ ...s, allowR: e.target.checked }))}
              />
              R
            </label>
          </div>

          {!(settings.allowG || settings.allowPG || settings.allowPG13 || settings.allowR) && (
            <p className="text-sm text-red-600">Pick at least one rating.</p>
          )}
        </div>

        <button
          className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-40"
          onClick={onCreate}
          disabled={!canCreate}
        >
          Create group
        </button>

        <a className="text-sm underline" href="/">
          Back to home
        </a>
      </div>
    </div>
  );
}
