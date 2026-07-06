"use client";

import { useEffect } from "react";

export function LaunchSuccessBanner() {
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("launched");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  return (
    <div className="mt-6 border-l-4 px-5 py-4 editorial-rule" style={{ borderColor: "var(--accent)" }} role="status">
      <p className="eyebrow">Launch confirmed</p>
      <p className="mt-2 font-bold">Agent successfully launched.</p>
    </div>
  );
}
