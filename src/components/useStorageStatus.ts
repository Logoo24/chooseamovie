"use client";

import { useEffect, useState } from "react";
import { checkSupabaseReachable } from "@/lib/api";
import { isSupabaseConfigured } from "@/lib/supabase";

export type StorageMode = "checking" | "online" | "offline";

export function useStorageStatus() {
  const configured = isSupabaseConfigured();
  const [mode, setMode] = useState<StorageMode>(configured ? "checking" : "offline");

  useEffect(() => {
    let alive = true;

    if (!configured) {
      return () => {
        alive = false;
      };
    }

    void checkSupabaseReachable()
      .then((reachable) => {
        if (!alive) return;
        setMode(reachable ? "online" : "offline");
      })
      .catch(() => {
        if (!alive) return;
        setMode("offline");
      });

    return () => {
      alive = false;
    };
  }, [configured]);

  return {
    configured,
    mode,
    isOffline: mode === "offline",
    isOnline: mode === "online",
  };
}
