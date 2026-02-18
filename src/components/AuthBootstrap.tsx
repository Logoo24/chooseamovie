"use client";

import { useEffect } from "react";
import { ensureAnonymousSession } from "@/lib/supabase";

export function AuthBootstrap() {
  useEffect(() => {
    void ensureAnonymousSession();
  }, []);

  return null;
}
