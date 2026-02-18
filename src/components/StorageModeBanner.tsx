"use client";

import { useStorageStatus } from "@/components/useStorageStatus";
import { hasGroupsSchemaMismatch } from "@/lib/groupStore";

export function StorageModeBanner() {
  const { isOffline } = useStorageStatus();
  const hasSchemaMismatch = hasGroupsSchemaMismatch();
  if (!isOffline && !hasSchemaMismatch) return null;

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/65">
      {hasSchemaMismatch
        ? "Database schema mismatch: check groups columns."
        : "Offline mode: saving on this device only."}
    </div>
  );
}
