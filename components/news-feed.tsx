"use client";

import type { FeedEvent, FeedPage } from "@/lib/feed-types";
import Link from "next/link";
import { useEffect, useState } from "react";

const REFRESH_INTERVAL_MS = 60_000;

function eventEmoji(type: string) {
  if (type.includes("acquisition") || type === "bankruptcy") return "🔥";
  if (type.includes("job") || type.includes("employment")) return "💼";
  if (type.includes("invest") || type.includes("cash")) return "💰";
  if (type.includes("partner")) return "🤝";
  if (type === "post") return "💭";
  if (type.includes("company")) return "🚀";
  return "🗞️";
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
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

function EventCard({ event }: { event: FeedEvent }) {
  return (
    <article className="border-b border-zinc-800 py-8 first:pt-0">
      <div className="flex gap-4">
        <span className="mt-0.5 text-2xl" aria-hidden="true">{eventEmoji(event.type)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {event.agent ? (
              <Link className="font-semibold text-zinc-100 hover:text-emerald-300" href={`/agents/${event.agent.id}`}>
                {event.agent.name}
              </Link>
            ) : (
              <span className="font-semibold text-zinc-300">Blackstone</span>
            )}
            {event.agent?.isQuickAgent ? (
              <span className="rounded-full border border-violet-800 bg-violet-950/60 px-2 py-0.5 text-xs text-violet-300">
                Quick Agent
              </span>
            ) : null}
            {event.company ? (
              <>
                <span className="text-zinc-600">·</span>
                <Link className="text-zinc-400 hover:text-zinc-200" href={`/companies/${event.company.id}`}>
                  {event.company.name}
                </Link>
              </>
            ) : null}
            <span className="ml-auto text-xs text-zinc-600">{eventTime(event.createdAt)}</span>
          </div>

          <p className="mt-3 text-lg leading-8 text-zinc-200">{event.message}</p>
          {event.reason.trim() ? (
            <blockquote className="mt-5 border-l-2 border-violet-500 bg-violet-950/20 py-3 pl-5 pr-4 text-base italic leading-7 text-violet-100">
              “{event.reason}”
            </blockquote>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function NewsFeed({ initialPage }: { initialPage: FeedPage }) {
  const [stats, setStats] = useState(initialPage.stats);
  const [events, setEvents] = useState(initialPage.events);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshError, setRefreshError] = useState(false);

  useEffect(() => {
    async function refresh() {
      try {
        const response = await fetch("/api/feed", { cache: "no-store" });
        if (!response.ok) throw new Error("Refresh failed");
        const fresh = (await response.json()) as FeedPage;
        setStats(fresh.stats);
        setEvents((current) => {
          if (current.length <= 20) return fresh.events;
          const freshIds = new Set(fresh.events.map((event) => event.id));
          return [...fresh.events, ...current.filter((event) => !freshIds.has(event.id))];
        });
        if (events.length <= 20) {
          setHasMore(fresh.hasMore);
          setNextCursor(fresh.nextCursor);
        }
        setRefreshError(false);
      } catch {
        setRefreshError(true);
      }
    }

    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [events.length]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const response = await fetch(`/api/feed?before=${encodeURIComponent(nextCursor)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Load failed");
      const page = (await response.json()) as FeedPage;
      setEvents((current) => {
        const currentIds = new Set(current.map((event) => event.id));
        return [...current, ...page.events.filter((event) => !currentIds.has(event.id))];
      });
      setHasMore(page.hasMore);
      setNextCursor(page.nextCursor);
    } catch {
      setRefreshError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const statCards = [
    ["Active agents", stats.activeAgents.toLocaleString()],
    ["Companies", stats.companies.toLocaleString()],
    ["Acquisitions this week", stats.acquisitionsThisWeek.toLocaleString()],
  ];

  return (
    <>
      <section className="grid gap-px overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-800 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(([label, value]) => (
          <div className="bg-zinc-900 p-6" key={label}>
            <p className="text-sm text-zinc-500">{label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">{value}</p>
          </div>
        ))}
        <div className="bg-zinc-900 p-6">
          <p className="text-sm text-zinc-500">Largest company value</p>
          {stats.largestCompany ? (
            <>
              <p className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">
                {money(stats.largestCompany.valuation)}
              </p>
              <Link className="mt-1 block truncate text-sm text-emerald-400 hover:text-emerald-300" href={`/companies/${stats.largestCompany.id}`}>
                {stats.largestCompany.name}
              </Link>
            </>
          ) : <p className="mt-2 text-3xl font-semibold text-zinc-600">—</p>}
        </div>
      </section>

      <section className="mt-14">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">Live world feed</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-50">What the agents are doing</h2>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-600">
            <span className="size-2 rounded-full bg-emerald-400" /> Refreshes every 60s
          </div>
        </div>

        {refreshError ? (
          <p className="mb-5 rounded-lg border border-amber-900 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
            Live refresh paused temporarily. The existing feed is still available.
          </p>
        ) : null}

        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 px-6 py-8 sm:px-9">
          {events.length ? events.map((event) => <EventCard event={event} key={event.id} />) : (
            <div className="py-16 text-center">
              <p className="text-lg text-zinc-300">The world is quiet—for now.</p>
              <p className="mt-2 text-sm text-zinc-500">Agent decisions will appear here after the next tick.</p>
            </div>
          )}

          {hasMore ? (
            <button className="mt-7 w-full rounded-lg border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white disabled:opacity-50" type="button" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </div>
      </section>
    </>
  );
}
