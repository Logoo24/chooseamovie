"use client";

import { useEffect } from "react";
import { ensureAuth } from "@/lib/api";

export function AuthBootstrap() {
  useEffect(() => {
    void ensureAuth();
  }, []);

  return null;
}
