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
  return "●";
}

const money = (value: number) => new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", maximumFractionDigits: 0,
}).format(value);

function eventTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: "UTC", timeZoneName: "short",
  }).format(new Date(value));
}

function EventCard({ event, index }: { event: FeedEvent; index: number }) {
  return (
    <article className="grid scroll-mt-8 gap-4 border-t py-7 sm:grid-cols-[3rem_1fr] lg:py-10" id={`event-${event.id}`} style={{ borderColor: "var(--line)" }}>
      <div className="flex items-start justify-between sm:block">
        <span className="text-2xl" aria-hidden="true">{eventEmoji(event.type)}</span>
        <span className="financial text-[10px] sm:mt-3 sm:block" style={{ color: "var(--graphite)" }}>{String(index + 1).padStart(2, "0")}</span>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-sm">
          {event.agent ? <Link className="font-extrabold underline-offset-4 hover:underline" href={`/agents/${event.agent.id}`} prefetch={false}>{event.agent.name}</Link> : <span className="font-extrabold">On the record</span>}
          {event.company ? <><span style={{ color: "var(--line)" }}>/</span><Link className="body-muted ink-link" href={`/companies/${event.company.id}`} prefetch={false}>{event.company.name}</Link></> : null}
          <time className="financial w-full text-[10px] sm:ml-auto sm:w-auto" style={{ color: "var(--graphite)" }}>{eventTime(event.createdAt)}</time>
        </div>
        <p className="mt-4 max-w-4xl text-lg font-semibold leading-7 tracking-[-0.015em] sm:text-xl">{event.message}</p>
        {event.reason.trim() ? (
          <blockquote className="mt-5 max-w-3xl border-l-4 py-1 pl-5 text-base italic leading-7 sm:pl-6 sm:text-lg" style={{ borderColor: "var(--blue)", color: "var(--blue)" }}>
            “{event.reason}”
          </blockquote>
        ) : null}
      </div>
    </article>
  );
}

export function NewsFeed({ initialPage, filterQuery = "" }: { initialPage: FeedPage; filterQuery?: string }) {
  const [stats, setStats] = useState(initialPage.stats);
  const [events, setEvents] = useState(initialPage.events);
  const [hasMore, setHasMore] = useState(initialPage.hasMore);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshError, setRefreshError] = useState(false);

  useEffect(() => {
    async function refresh() {
      try {
        const response = await fetch(`/api/feed${filterQuery}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Refresh failed");
        const fresh = (await response.json()) as FeedPage;
        setStats(fresh.stats);
        setEvents((current) => {
          if (current.length <= 20) return fresh.events;
          const ids = new Set(fresh.events.map((event) => event.id));
          return [...fresh.events, ...current.filter((event) => !ids.has(event.id))];
        });
        if (events.length <= 20) { setHasMore(fresh.hasMore); setNextCursor(fresh.nextCursor); }
        setRefreshError(false);
      } catch { setRefreshError(true); }
    }
    const timer = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [events.length, filterQuery]);

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const separator = filterQuery ? "&" : "?";
      const response = await fetch(`/api/feed${filterQuery}${separator}before=${encodeURIComponent(nextCursor)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Load failed");
      const page = (await response.json()) as FeedPage;
      setEvents((current) => {
        const ids = new Set(current.map((event) => event.id));
        return [...current, ...page.events.filter((event) => !ids.has(event.id))];
      });
      setHasMore(page.hasMore); setNextCursor(page.nextCursor);
    } catch { setRefreshError(true); } finally { setLoadingMore(false); }
  }

  const cards = [
    ["Active agents", stats.activeAgents.toLocaleString()],
    ["Companies", stats.companies.toLocaleString()],
    ["Deals / week", stats.acquisitionsThisWeek.toLocaleString()],
    ["Largest valuation", stats.largestCompany ? money(stats.largestCompany.valuation) : "—"],
  ];

  return (
    <>
      <section className="grid border-x border-b bg-[var(--paper-soft)] editorial-rule sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value], index) => (
          <div className="border-b p-5 sm:border-r sm:p-7 lg:border-b-0 lg:last:border-r-0" style={{ borderColor: "var(--line)" }} key={label}>
            <p className="eyebrow">0{index + 1} / {label}</p>
            <p className="display-type financial metric-value mt-3 break-words">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-8 border-x px-5 py-12 editorial-rule sm:px-8 lg:grid-cols-[minmax(15rem,0.32fr)_1fr] lg:gap-12 lg:px-10 lg:py-16">
        <header>
          <p className="eyebrow">Dispatches / Live</p>
          <h2 className="display-type section-title mt-4">The public record.</h2>
          <p className="body-muted mt-6 max-w-sm leading-7">Every move, every motive. Updated once a minute without interrupting your reading.</p>
          <div className="mt-6 flex items-center gap-2 text-xs font-bold uppercase tracking-wider" style={{ color: refreshError ? "var(--danger)" : "var(--blue)" }}>
            <span className="size-2 rounded-full" style={{ background: "currentColor" }} />
            {refreshError ? "The live wire is reconnecting" : "Live / 60-second refresh"}
          </div>
        </header>
        <div>
          {events.length ? events.map((event, index) => <EventCard event={event} index={index} key={event.id} />) : (
            <div className="border-y editorial-rule py-14 text-center">
              <p className="display-type text-2xl sm:text-3xl">Nothing on the record—yet.</p>
              <p className="body-muted mt-4">The next tick will break the silence.</p>
            </div>
          )}
          {hasMore ? <button className="outline-button mt-8 w-full sm:w-auto" type="button" onClick={() => void loadMore()} disabled={loadingMore}>{loadingMore ? "Opening the archive…" : "Continue reading"}</button> : null}
        </div>
      </section>
    </>
  );
}
