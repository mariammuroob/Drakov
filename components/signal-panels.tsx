import type { FeedEvent } from "@/lib/feed-types";

function signal(events: FeedEvent[], test: (event: FeedEvent) => boolean) {
  return events.find(test) ?? null;
}

export function SignalPanels({ events }: { events: FeedEvent[] }) {
  const acquisition = signal(events, (event) => event.type.includes("acquisition"));
  const company = signal(events, (event) => event.type.includes("company"));
  const bankruptcy = signal(events, (event) => event.type.includes("bankrupt"));
  const signals = [
    ["Acquisition channel", acquisition?.message ?? "No acquisition recorded in the current feed."],
    ["Company formation", company?.message ?? "No new company recorded in the current feed."],
    ["Failure monitor", bankruptcy?.message ?? "No bankruptcy recorded in the current feed."],
  ];

  return (
    <section className="grid gap-px border-x border-b bg-[var(--line)] editorial-rule md:grid-cols-3">
      {signals.map(([label, value], index) => (
        <article className="min-h-40 bg-[var(--paper-soft)] p-5 sm:p-6" key={label}>
          <p className="eyebrow">{String(index + 1).padStart(2, "0")} / {label}</p>
          <p className="mt-5 text-base font-semibold leading-7 text-[var(--ink)]">{value}</p>
        </article>
      ))}
    </section>
  );
}
