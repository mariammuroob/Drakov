import type { DailyMarketClose } from "@/lib/feed-types";
import { SegmentedStat } from "@/components/segmented-stat";
import Link from "next/link";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`));
}

function timeLabel(value: string) {
  if (!value) return "Pending";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}

function MovementLine({
  label,
  amount,
  name,
  tone,
}: {
  label: string;
  amount: number | null;
  name: string | null;
  tone: "amber" | "crimson";
}) {
  return (
    <div className="paper-card p-4">
      <p className="eyebrow">{label}</p>
      {amount === null || !name ? (
        <p className="body-muted mt-3 text-sm leading-6">No cash movement recorded in this window yet.</p>
      ) : (
        <>
          <div className="mt-3">
            <SegmentedStat format="currency" label={label} size="compact" tone={tone} value={Math.abs(amount)} />
          </div>
          <p className="mt-3 text-sm font-semibold leading-6">{name}</p>
        </>
      )}
    </div>
  );
}

export function DailyMarketCloseCard({ close }: { close: DailyMarketClose | null }) {
  if (!close) {
    return (
      <article className="market-close-card paper-card p-6 sm:p-8">
        <p className="eyebrow">Daily Market Close</p>
        <h2 className="display-type mt-4 text-4xl uppercase leading-none sm:text-5xl">The close is waiting for its first tick.</h2>
        <p className="body-muted mt-5 max-w-2xl leading-7">Once the scheduler finalizes a market window, the day’s cash moves, rivalries, bankruptcies, and pressure points will settle here.</p>
      </article>
    );
  }

  const gain = close.biggestCashGain;
  const loss = close.biggestCashLoss;
  const rivalry = close.highestIntensityRivalry;
  const newest = close.newestRivalry;
  const brink = close.closestToBankruptcyAgent;
  const company = close.mostInteractedCompany;

  return (
    <article className="market-close-card paper-card p-6 sm:p-8 lg:p-10">
      <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <p className="eyebrow">Daily Market Close / {dateLabel(close.marketDate)}</p>
          <h2 className="display-type mt-4 text-4xl uppercase leading-none sm:text-5xl">The day left marks.</h2>
          <p className="body-muted mt-5 leading-7">
            Generated {timeLabel(close.generatedAt)}. The close is stored once per UTC day and refreshed by market ticks, not by page views.
          </p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <MovementLine label="Biggest gain" amount={gain?.amount ?? null} name={gain?.entityName ?? null} tone="amber" />
            <MovementLine label="Biggest loss" amount={loss?.amount ?? null} name={loss?.entityName ?? null} tone="crimson" />
          </div>
        </div>

        <div className="grid gap-px overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2">
          <div className="live-stat">
            <p className="eyebrow">Bankruptcies today</p>
            <SegmentedStat label="Bankruptcies today" tone="crimson" value={close.bankruptcies} />
          </div>
          <div className="live-stat">
            <p className="eyebrow">Closest to zero</p>
            {brink ? <SegmentedStat format="currency" label={`${brink.name} cash`} tone="amber" value={brink.cash} /> : <p className="body-muted mt-3">No active agents.</p>}
            {brink ? <Link className="ink-link mt-3 inline-block text-sm" href={`/agents/${brink.id}`}>{brink.name}</Link> : null}
          </div>
          <div className="live-stat">
            <p className="eyebrow">Most intense rivalry</p>
            {rivalry ? (
              <>
                <SegmentedStat label="Rivalry intensity" tone="crimson" value={rivalry.intensity} />
                <p className="mt-3 text-sm font-semibold leading-6">{rivalry.agentAName} vs. {rivalry.agentBName}</p>
              </>
            ) : <p className="body-muted mt-3">No rivalries recorded.</p>}
          </div>
          <div className="live-stat">
            <p className="eyebrow">Company with the most contact</p>
            {company ? (
              <>
                <SegmentedStat label={`${company.name} interactions`} tone="blue" value={company.interactionCount} />
                <Link className="ink-link mt-3 inline-block text-sm" href={`/companies/${company.id}`}>{company.name}</Link>
              </>
            ) : <p className="body-muted mt-3">No company interactions today.</p>}
          </div>
        </div>
      </div>

      {newest ? (
        <div className="mt-8 border-t pt-5 text-sm leading-6" style={{ borderColor: "var(--line)" }}>
          <span className="font-bold text-[var(--crimson)]">Newest rivalry:</span>{" "}
          <Link className="ink-link" href={`/feed?agent_a=${encodeURIComponent(newest.agentAId)}&agent_b=${encodeURIComponent(newest.agentBId)}`}>
            {newest.agentAName} vs. {newest.agentBName}
          </Link>
        </div>
      ) : null}
    </article>
  );
}
