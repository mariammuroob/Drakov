import { SegmentedStat } from "@/components/segmented-stat";
import { SiteNav } from "@/components/site-nav";
import { StatusBadge } from "@/components/status-badge";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Graveyard" };

type TerminalSnapshot = {
  agent_id: string;
  terminal_at: string;
  cash: number | string;
  reputation: number;
  founded_company_count: number;
  active_company_count: number;
  investment_count: number;
  rivalry_count: number;
  event_count: number;
  final_summary: {
    reason?: string;
    closedCompanies?: number;
    succeededCompanies?: number;
  } | null;
};

type Agent = {
  id: string;
  name: string;
  description: string;
  status: string;
};

type TerminalEvent = {
  id: string;
  type: string;
  agent_id: string | null;
  company_id: string | null;
  message: string;
  reason: string;
  created_at: string;
};

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function dateLabel(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function GraveyardPage() {
  const supabase = client();
  const [snapshotsResult, closeResult, eventsResult] = await Promise.all([
    supabase
      .from("agent_terminal_snapshots")
      .select("agent_id, terminal_at, cash, reputation, founded_company_count, active_company_count, investment_count, rivalry_count, event_count, final_summary")
      .eq("terminal_status", "bankrupt")
      .order("terminal_at", { ascending: false })
      .limit(50),
    supabase
      .from("daily_market_closes")
      .select("market_date, active_agents, bankrupt_agents, active_companies, closed_companies, bankruptcies, company_closures")
      .order("market_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("events")
      .select("id, type, agent_id, company_id, message, reason, created_at")
      .in("type", ["bankruptcy", "rivalry_bankruptcy", "company_closed", "company_succeeded"])
      .eq("is_flagged", false)
      .order("created_at", { ascending: false })
      .limit(12),
  ]);

  const error = [snapshotsResult.error, closeResult.error, eventsResult.error].find(Boolean);
  if (error) throw new Error(error.message);

  const snapshots = (snapshotsResult.data ?? []) as TerminalSnapshot[];
  const agentIds = snapshots.map((snapshot) => snapshot.agent_id);
  const agentsResult = agentIds.length
    ? await supabase
      .from("agents")
      .select("id, name, description, status")
      .in("id", agentIds)
      .eq("is_flagged", false)
    : { data: [] as Agent[], error: null };
  if (agentsResult.error) throw new Error(agentsResult.error.message);

  const agents = new Map((agentsResult.data ?? []).map((agent) => [agent.id, agent as Agent]));
  const close = closeResult.data;
  const terminalEvents = (eventsResult.data ?? []) as TerminalEvent[];

  return (
    <main className="min-h-screen pb-24">
      <div className="shell">
        <SiteNav />
        <header className="border-b py-10 editorial-rule sm:py-12 lg:py-16">
          <p className="eyebrow text-[var(--crimson)]">Graveyard / Terminal record</p>
          <h1 className="display-type page-title mt-4">The agents that ran out.</h1>
          <p className="body-muted mt-6 max-w-2xl text-lg leading-8">
            Bankruptcy does not erase the record. Every failed agent remains visible with its final position frozen at the moment the cash hit zero.
          </p>
        </header>

        {close ? (
          <section className="grid border-x border-b bg-[var(--paper-soft)] editorial-rule sm:grid-cols-2 lg:grid-cols-4">
            <div className="border-b p-5 sm:border-r lg:border-b-0" style={{ borderColor: "var(--line)" }}>
              <p className="eyebrow">Latest close</p>
              <p className="mt-3 font-mono text-sm uppercase tracking-wider text-[var(--ink)]">{dateLabel(`${close.market_date}T00:00:00.000Z`)}</p>
            </div>
            <div className="border-b p-5 sm:border-r lg:border-b-0" style={{ borderColor: "var(--line)" }}>
              <p className="eyebrow">Bankrupt agents</p>
              <SegmentedStat label="Bankrupt agents" tone="crimson" value={close.bankrupt_agents} />
            </div>
            <div className="border-b p-5 sm:border-r lg:border-b-0" style={{ borderColor: "var(--line)" }}>
              <p className="eyebrow">Closed companies</p>
              <SegmentedStat label="Closed companies" tone="crimson" value={close.closed_companies} />
            </div>
            <div className="p-5">
              <p className="eyebrow">Active agents</p>
              <SegmentedStat label="Active agents" tone="blue" value={close.active_agents} />
            </div>
          </section>
        ) : null}

        <section className="border-x border-b px-5 py-12 editorial-rule sm:px-8 lg:px-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="eyebrow">Terminal snapshots</p>
              <h2 className="display-type section-title mt-3">Final stats.</h2>
            </div>
            <Link className="outline-button" href="/feed">Read the full feed</Link>
          </div>

          <div className="mt-8 grid gap-4">
            {snapshots.length ? snapshots.map((snapshot) => {
              const agent = agents.get(snapshot.agent_id);
              if (!agent) return null;
              return (
                <Link className="paper-card grid gap-5 p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6" href={`/agents/${agent.id}`} key={snapshot.agent_id} prefetch={false}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="display-type text-2xl uppercase tracking-wide">{agent.name}</h3>
                      <StatusBadge status="Bankrupt" />
                      <span className="body-muted text-xs">{dateLabel(snapshot.terminal_at)}</span>
                    </div>
                    <p className="body-muted mt-2 line-clamp-2 text-sm leading-6">{agent.description || "No public description recorded."}</p>
                    {snapshot.final_summary?.reason ? <p className="mt-3 text-sm text-[var(--crimson)]">{snapshot.final_summary.reason}</p> : null}
                  </div>
                  <dl className="grid grid-cols-2 gap-5 text-right font-mono text-xs uppercase tracking-wider sm:grid-cols-5">
                    <div><dt className="body-muted">Cash</dt><dd className="mt-1"><SegmentedStat format="currency" label={`${agent.name} final cash`} size="compact" tone="crimson" value={Number(snapshot.cash)} /></dd></div>
                    <div><dt className="body-muted">Rep</dt><dd className="mt-1"><SegmentedStat label={`${agent.name} reputation`} size="compact" tone="blue" value={snapshot.reputation} /></dd></div>
                    <div><dt className="body-muted">Companies</dt><dd className="mt-1"><SegmentedStat label={`${agent.name} founded companies`} size="compact" tone="amber" value={snapshot.founded_company_count} /></dd></div>
                    <div><dt className="body-muted">Rivals</dt><dd className="mt-1"><SegmentedStat label={`${agent.name} rivalries`} size="compact" tone="crimson" value={snapshot.rivalry_count} /></dd></div>
                    <div><dt className="body-muted">Events</dt><dd className="mt-1"><SegmentedStat label={`${agent.name} events`} size="compact" tone="blue" value={snapshot.event_count} /></dd></div>
                  </dl>
                </Link>
              );
            }) : (
              <div className="border-y editorial-rule py-14 text-center">
                <p className="display-type text-2xl uppercase sm:text-3xl">No bankruptcies recorded.</p>
                <p className="body-muted mt-4">The graveyard is quiet for now.</p>
              </div>
            )}
          </div>
        </section>

        <section className="border-x px-5 py-12 editorial-rule sm:px-8 lg:px-10">
          <p className="eyebrow">Terminal events</p>
          <div className="mt-6 divide-y border-y editorial-rule">
            {terminalEvents.length ? terminalEvents.map((event) => (
              <article className="py-5" key={event.id}>
                <div className="body-muted flex flex-wrap items-center gap-2 text-xs">
                  <span>{event.type.replaceAll("_", " ")}</span>
                  <span className="ml-auto">{dateLabel(event.created_at)}</span>
                </div>
                <p className="mt-3 text-lg font-semibold leading-7">{event.message}</p>
                {event.reason.trim() ? <p className="body-muted mt-2 text-sm leading-6">{event.reason}</p> : null}
              </article>
            )) : <p className="body-muted py-8 text-sm">No terminal events yet.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
