"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
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

  useEffect(() => {
    setGroup(loadGroup(groupId));
  }, [groupId]);

  const inviteLink = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/g/${groupId}`;
  }, [groupId]);

  if (!group) {
    return (
      <div className="min-h-screen p-6">
        <div className="mx-auto max-w-xl space-y-4">
          <h1 className="text-2xl font-semibold">Group not found</h1>
          <p className="text-sm text-gray-700">
            This group only exists in the browser that created it (for now).
          </p>
          <a className="text-sm underline" href="/create">
            Create a new group
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="mx-auto max-w-xl space-y-6">
        <h1 className="text-2xl font-semibold">{group.name}</h1>

        <div className="space-y-2 rounded border p-4">
          <div className="text-sm font-medium">Invite link</div>
          <div className="break-all rounded bg-gray-50 p-2 text-sm">{inviteLink}</div>

          <button
            className="rounded bg-black px-3 py-2 text-sm text-white"
            onClick={async () => {
              await navigator.clipboard.writeText(inviteLink);
              alert("Copied invite link!");
            }}
          >
            Copy link
          </button>
        </div>

        <div className="space-y-2 rounded border p-4">
          <div className="text-sm font-medium">Settings</div>
          <div className="text-sm text-gray-700">
            Content:{" "}
            {group.settings.contentType === "movies" ? "Movies only" : "Movies and shows"}
          </div>
          <div className="text-sm text-gray-700">Allowed ratings: {ratingLabel(group)}</div>
        </div>

        <div className="flex gap-3">
          <a className="rounded border px-3 py-2 text-sm" href="/create">
            Create another group
          </a>
        </div>
      </div>
    </div>
  );
}
