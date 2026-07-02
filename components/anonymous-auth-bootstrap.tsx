"use client";

import { useEffect } from "react";

export function AnonymousAuthBootstrap() {
  useEffect(() => {
    void fetch("/api/auth/anonymous", { method: "POST" });
  }, []);

  return null;
}
