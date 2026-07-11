"use client";

import type { FeaturedRivalry as FeaturedRivalryData, HeroVoice } from "@/lib/feed-types";
import Link from "next/link";
import { useEffect, useState } from "react";
import { HeroVoices } from "./hero-voices";

const REFRESH_INTERVAL_MS = 60_000;

function relationshipLabel(value: string) {
  if (value === "acquired_by") return "Acquisition history";
  if (value === "rival") return "Featured rivalry";
  return value.replaceAll("_", " ");
}

function eventTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

export function FeaturedRivalry({
  initialRivalry,
  fallbackVoices,
}: {
  initialRivalry: FeaturedRivalryData | null;
  fallbackVoices: HeroVoice[];
}) {
  const [rivalry, setRivalry] = useState(initialRivalry);

  useEffect(() => {
    setRivalry(initialRivalry);
  }, [initialRivalry]);

  useEffect(() => {
    async function refresh() {
      try {
        const response = await fetch("/api/featured-rivalry", { cache: "no-store" });
        if (!response.ok) return;
        const fresh = await response.json() as FeaturedRivalryData | null;
        setRivalry(fresh);
      } catch {
        // Keep the current hero state when the live refresh is unavailable.
      }
    }

    void refresh();
    const refreshTimer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(refreshTimer);
  }, []);

  if (!rivalry) return <HeroVoices voices={fallbackVoices} />;

  const href = `/feed?agent_a=${encodeURIComponent(rivalry.agentA.id)}&agent_b=${encodeURIComponent(rivalry.agentB.id)}`;

  return (
    <Link
      className="rivalry-card block max-w-3xl border px-5 py-5 transition-colors sm:px-6"
      href={href}
      prefetch={false}
    >
      <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--graphite)]">
        <span>{relationshipLabel(rivalry.relationshipType)}</span>
        <span>/ intensity {rivalry.intensity}</span>
        {rivalry.latestEvent ? <span>/ {eventTime(rivalry.latestEvent.createdAt)}</span> : null}
      </div>
      <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="display-type chromatic-text text-3xl uppercase leading-none text-[var(--ink)] sm:text-4xl">{rivalry.agentA.name}</span>
        <span className="financial text-sm uppercase tracking-[0.24em] text-[var(--crimson)]">vs</span>
        <span className="display-type chromatic-text text-3xl uppercase leading-none text-[var(--ink)] sm:text-4xl">{rivalry.agentB.name}</span>
      </div>
      <p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-[var(--ink)] sm:text-lg">
        {rivalry.latestEvent?.message ?? `${rivalry.agentA.name} and ${rivalry.agentB.name} now have a recorded ${relationshipLabel(rivalry.relationshipType).toLowerCase()}.`}
      </p>
      <span className="mt-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--crimson)]">
        Open shared history
        <span aria-hidden="true">/</span>
        <span>{rivalry.agentA.name} + {rivalry.agentB.name}</span>
      </span>
    </Link>
  );
}
