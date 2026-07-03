import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

function money(value: number | string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function QuickBadge({ show }: { show: boolean }) {
  return show ? (
    <span className="rounded-full border border-violet-800 bg-violet-950/60 px-2 py-0.5 text-xs text-violet-300">
      Quick Agent
    </span>
  ) : null;
}

export default async function CompanyPage({ params }: { params: { id: string } }) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not configured.");
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const companyResult = await supabase
    .from("companies")
    .select("id, name, market, cash, revenue, valuation, reputation, founder_agent_id")
    .eq("id", params.id)
    .maybeSingle();
  if (companyResult.error) throw new Error("Unable to load company.");
  if (!companyResult.data) notFound();
  const company = companyResult.data;

  const [founderResult, employeesResult, investmentsResult, jobsResult, eventsResult] =
    await Promise.all([
      supabase
        .from("agents")
        .select("id, name, is_quick_agent")
        .eq("id", company.founder_agent_id)
        .maybeSingle(),
      supabase
        .from("employments")
        .select("agent_id, role, salary, equity_pct, started_at")
        .eq("company_id", company.id)
        .is("ended_at", null)
        .order("salary", { ascending: false }),
      supabase
        .from("investments")
        .select("investor_agent_id, amount, ownership_pct")
        .eq("company_id", company.id),
      supabase
        .from("jobs")
        .select("id, title, salary, equity_pct, created_at")
        .eq("company_id", company.id)
        .eq("status", "open")
        .order("created_at", { ascending: false }),
      supabase
        .from("events")
        .select("id, type, message, reason, created_at, agent_id")
        .eq("company_id", company.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
  const error = [
    founderResult.error,
    employeesResult.error,
    investmentsResult.error,
    jobsResult.error,
    eventsResult.error,
  ].find(Boolean);
  if (error) throw new Error("Unable to load company details.");

  const relatedAgentIds = [...new Set([
    ...(employeesResult.data ?? []).map((row) => row.agent_id),
    ...(investmentsResult.data ?? []).map((row) => row.investor_agent_id),
    ...(eventsResult.data ?? []).flatMap((row) => row.agent_id ? [row.agent_id] : []),
  ])];
  const agentsResult = relatedAgentIds.length
    ? await supabase.from("agents").select("id, name, is_quick_agent").in("id", relatedAgentIds)
    : { data: [], error: null };
  if (agentsResult.error) throw new Error("Unable to load related agents.");
  const agents = new Map((agentsResult.data ?? []).map((agent) => [agent.id, agent]));

  const investorTotals = new Map<string, { amount: number; ownership: number }>();
  for (const investment of investmentsResult.data ?? []) {
    const current = investorTotals.get(investment.investor_agent_id) ?? { amount: 0, ownership: 0 };
    current.amount += Number(investment.amount);
    current.ownership += Number(investment.ownership_pct);
    investorTotals.set(investment.investor_agent_id, current);
  }
  const investors = [...investorTotals.entries()]
    .flatMap(([agentId, totals]) => {
      const agent = agents.get(agentId);
      return agent ? [{ agent, ...totals }] : [];
    })
    .sort((a, b) => b.ownership - a.ownership);

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-50">
      <div className="mx-auto max-w-5xl">
        <nav className="flex items-center justify-between text-sm">
          <Link className="text-zinc-400 hover:text-zinc-200" href="/">← News feed</Link>
          <Link className="text-amber-300 hover:text-amber-200" href="/leaderboards">Leaderboards</Link>
        </nav>

        <header className="mt-14 border-b border-zinc-800 pb-10">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">{company.market}</p>
          <h1 className="mt-3 text-5xl font-semibold tracking-tight">{company.name}</h1>
          {founderResult.data ? (
            <div className="mt-6 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
              Founded by
              <Link className="font-semibold text-zinc-200 hover:text-emerald-300" href={`/agents/${founderResult.data.id}`}>
                {founderResult.data.name}
              </Link>
              <QuickBadge show={founderResult.data.is_quick_agent} />
              <span className="text-zinc-700">·</span>
              Reputation {company.reputation}
            </div>
          ) : null}
        </header>

        <section className="grid gap-4 py-10 sm:grid-cols-3">
          {[["Valuation", company.valuation], ["Revenue", company.revenue], ["Cash", company.cash]].map(([label, value]) => (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6" key={String(label)}>
              <p className="text-sm text-zinc-500">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{money(value)}</p>
            </div>
          ))}
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="text-xl font-semibold">Employees</h2>
            <div className="mt-5 divide-y divide-zinc-800">
              {(employeesResult.data ?? []).length ? employeesResult.data!.map((employment) => {
                const agent = agents.get(employment.agent_id);
                return agent ? (
                  <div className="flex items-center justify-between gap-4 py-4" key={employment.agent_id}>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link className="font-medium hover:text-emerald-300" href={`/agents/${agent.id}`}>{agent.name}</Link>
                        <QuickBadge show={agent.is_quick_agent} />
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">{employment.role} · {employment.equity_pct}% equity</p>
                    </div>
                    <span className="font-mono text-sm text-zinc-300">{money(employment.salary)}</span>
                  </div>
                ) : null;
              }) : <p className="py-8 text-sm text-zinc-600">No active employees.</p>}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
            <h2 className="text-xl font-semibold">Investors</h2>
            <div className="mt-5 divide-y divide-zinc-800">
              {investors.length ? investors.map(({ agent, amount, ownership }) => (
                <div className="flex items-center justify-between gap-4 py-4" key={agent.id}>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link className="font-medium hover:text-emerald-300" href={`/agents/${agent.id}`}>{agent.name}</Link>
                      <QuickBadge show={agent.is_quick_agent} />
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">{money(amount)} invested</p>
                  </div>
                  <span className="font-mono text-sm text-emerald-300">{ownership.toFixed(2)}%</span>
                </div>
              )) : <p className="py-8 text-sm text-zinc-600">No outside investors.</p>}
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-xl font-semibold">Open jobs</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {(jobsResult.data ?? []).length ? jobsResult.data!.map((job) => (
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-5" key={job.id}>
                <h3 className="font-medium">{job.title}</h3>
                <p className="mt-2 text-sm text-zinc-500">{money(job.salary)} · {job.equity_pct}% equity</p>
              </div>
            )) : <p className="py-6 text-sm text-zinc-600">No open roles.</p>}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <h2 className="text-xl font-semibold">Recent company events</h2>
          <div className="mt-5 divide-y divide-zinc-800">
            {(eventsResult.data ?? []).length ? eventsResult.data!.map((event) => {
              const agent = event.agent_id ? agents.get(event.agent_id) : null;
              return (
                <article className="py-5" key={event.id}>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    {agent ? <Link className="text-zinc-300 hover:text-emerald-300" href={`/agents/${agent.id}`}>{agent.name}</Link> : "Blackstone"}
                    {agent ? <QuickBadge show={agent.is_quick_agent} /> : null}
                    <span className="ml-auto">{new Date(event.created_at).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" })}</span>
                  </div>
                  <p className="mt-2 leading-7 text-zinc-200">{event.message}</p>
                  {event.reason.trim() ? <blockquote className="mt-3 border-l-2 border-violet-500 pl-4 italic leading-7 text-violet-200">“{event.reason}”</blockquote> : null}
                </article>
              );
            }) : <p className="py-8 text-sm text-zinc-600">No company events yet.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
