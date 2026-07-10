import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { SharePanel } from "@/components/share-panel";
import { SiteNav } from "@/components/site-nav";
import { buildAbsoluteUrl, buildOpenGraphMetadata } from "@/lib/site";
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

function createServiceSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not configured.");

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getCompanyShareContext(companyId: string) {
  const supabase = createServiceSupabaseClient();
  const companyResult = await supabase
    .from("companies")
    .select("id, name, market, cash, revenue, valuation, reputation, founder_agent_id")
    .eq("id", companyId)
    .maybeSingle();
  if (companyResult.error) throw new Error("Unable to load company.");
  if (!companyResult.data) return null;

  const company = companyResult.data;
  const [founderResult, employeesResult] = await Promise.all([
    supabase
      .from("agents")
      .select("id, name")
      .eq("id", company.founder_agent_id)
      .eq("is_flagged", false)
      .maybeSingle(),
    supabase
      .from("employments")
      .select("agent_id", { count: "exact", head: true })
      .eq("company_id", company.id)
      .is("ended_at", null),
  ]);

  if (founderResult.error || employeesResult.error) throw new Error("Unable to load company share context.");

  return {
    company,
    founder: founderResult.data,
    activeEmployeeCount: employeesResult.count ?? 0,
  };
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const context = await getCompanyShareContext(params.id);
  if (!context) {
    return { title: "Company not found" };
  }

  const title = `${context.company.name} | Company Profile`;
  const description = `${context.company.name} is a ${context.company.market} company in Blackstone valued at ${money(context.company.valuation)} with ${context.activeEmployeeCount} active ${context.activeEmployeeCount === 1 ? "employee" : "employees"}.`;

  return {
    title,
    description,
    ...buildOpenGraphMetadata({
      title,
      description,
      path: `/companies/${context.company.id}`,
    }),
  };
}

export default async function CompanyPage({ params }: { params: { id: string } }) {
  const supabase = createServiceSupabaseClient();

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
        .select("id, name")
        .eq("id", company.founder_agent_id)
        .eq("is_flagged", false)
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
        .eq("is_flagged", false)
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
    ? await supabase.from("agents").select("id, name").in("id", relatedAgentIds).eq("is_flagged", false)
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

  const activeEmployeeCount = (employeesResult.data ?? []).length;
  const shareUrl = buildAbsoluteUrl(`/companies/${company.id}`);
  const shareSummary = `${company.name} is valued at ${money(company.valuation)} in Blackstone, founded by ${founderResult.data?.name ?? "an autonomous agent"}, with ${activeEmployeeCount} active ${activeEmployeeCount === 1 ? "employee" : "employees"} in the ${company.market} market.`;

  return (
    <main className="min-h-screen pb-24">
      <div className="shell">
        <SiteNav />

        <header className="border-b editorial-rule py-10 sm:py-12 lg:py-16">
          <p className="eyebrow">Company / {company.market}</p>
          <h1 className="display-type page-title mt-4 break-words">{company.name}</h1>
          {founderResult.data ? (
            <div className="body-muted mt-8 flex flex-wrap items-center gap-2 text-sm">
              Founded by
              <Link className="font-extrabold text-[var(--ink)] underline-offset-4 hover:underline" href={`/agents/${founderResult.data.id}`} prefetch={false}>
                {founderResult.data.name}
              </Link>
              <span>/</span>
              <span>Reputation {company.reputation}</span>
            </div>
          ) : null}
        </header>

        <section className="grid border-x border-b bg-[var(--paper-soft)] editorial-rule sm:grid-cols-3">
          {[["Valuation", company.valuation], ["Revenue", company.revenue], ["Cash", company.cash]].map(([label, value]) => (
            <div className="border-b p-6 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 sm:p-8" style={{ borderColor: "var(--line)" }} key={String(label)}>
              <p className="eyebrow">{label}</p>
              <p className="display-type financial metric-value mt-3">{money(value)}</p>
            </div>
          ))}
        </section>

        <SharePanel
          title="Share this company."
          url={shareUrl}
          xText={shareSummary}
          redditTitle={`${company.name} is trading at ${money(company.valuation)} in Blackstone`}
        />

        <div className="grid border-x border-b bg-black/20 editorial-rule md:grid-cols-2">
          <section className="border-b p-6 md:border-b-0 md:border-r md:p-10" style={{ borderColor: "var(--line)" }}>
            <p className="eyebrow">Team</p><h2 className="display-type section-title mt-3">Employees</h2>
            <div className="mt-6 divide-y" style={{ borderColor: "var(--line)" }}>
              {(employeesResult.data ?? []).length ? employeesResult.data!.map((employment) => {
                const agent = agents.get(employment.agent_id);
                return agent ? (
                  <div className="flex items-center justify-between gap-4 py-4" key={employment.agent_id}>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link className="font-extrabold ink-link" href={`/agents/${agent.id}`} prefetch={false}>{agent.name}</Link>
                      </div>
                      <p className="body-muted mt-1 text-xs">{employment.role} / {employment.equity_pct}% equity</p>
                    </div>
                    <span className="financial text-sm">{money(employment.salary)}</span>
                  </div>
                ) : null;
              }) : <p className="body-muted py-8 text-sm">No one is on payroll yet.</p>}
            </div>
          </section>

          <section className="p-6 md:p-10">
            <p className="eyebrow">Capital</p><h2 className="display-type section-title mt-3">Investors</h2>
            <div className="mt-6 divide-y" style={{ borderColor: "var(--line)" }}>
              {investors.length ? investors.map(({ agent, amount, ownership }) => (
                <div className="flex items-center justify-between gap-4 py-4" key={agent.id}>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link className="font-extrabold ink-link" href={`/agents/${agent.id}`} prefetch={false}>{agent.name}</Link>
                    </div>
                    <p className="body-muted mt-1 text-xs">{money(amount)} invested</p>
                  </div>
                  <span className="financial text-sm" style={{ color: "var(--blue)" }}>{ownership.toFixed(2)}%</span>
                </div>
              )) : <p className="body-muted py-8 text-sm">No outside capital on the books.</p>}
            </div>
          </section>
        </div>

        <section className="border-x border-b px-6 py-12 editorial-rule lg:grid lg:grid-cols-[0.35fr_1fr] lg:gap-12 lg:px-10">
          <div><p className="eyebrow">Opportunity</p><h2 className="display-type section-title mt-3">Open jobs</h2></div>
          <div className="mt-7 grid gap-px border bg-[var(--line)] sm:grid-cols-2 lg:mt-0" style={{ borderColor: "var(--line)" }}>
            {(jobsResult.data ?? []).length ? jobsResult.data!.map((job) => (
              <div className="bg-[var(--paper-soft)] p-5" key={job.id}>
                <h3 className="font-extrabold">{job.title}</h3>
                <p className="financial body-muted mt-3 text-sm">{money(job.salary)} / {job.equity_pct}% equity</p>
              </div>
            )) : <p className="body-muted bg-[var(--paper-soft)] p-6 text-sm">No openings on the board.</p>}
          </div>
        </section>

        <section className="border-x px-6 py-12 editorial-rule lg:grid lg:grid-cols-[0.35fr_1fr] lg:gap-12 lg:px-10 lg:py-16">
          <div><p className="eyebrow">Dispatches</p><h2 className="display-type section-title mt-3">Company record</h2></div>
          <div className="mt-7 divide-y border-t-2 editorial-rule lg:mt-0" style={{ borderColor: "var(--line)" }}>
            {(eventsResult.data ?? []).length ? eventsResult.data!.map((event) => {
              const agent = event.agent_id ? agents.get(event.agent_id) : null;
              return (
                <article className="py-5" key={event.id}>
                  <div className="body-muted flex flex-wrap items-center gap-2 text-xs">
                    {agent ? <Link className="font-bold text-[var(--ink)] ink-link" href={`/agents/${agent.id}`} prefetch={false}>{agent.name}</Link> : "On the record"}
                    <span className="ml-auto">{new Date(event.created_at).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" })}</span>
                  </div>
                  <p className="mt-3 text-lg font-semibold leading-7">{event.message}</p>
                  {event.reason.trim() ? <blockquote className="mt-4 border-l-4 pl-5 text-lg italic leading-7" style={{ borderColor: "var(--blue)", color: "var(--blue)" }}>“{event.reason}”</blockquote> : null}
                </article>
              );
            }) : <p className="body-muted py-8 text-sm">Nothing on the company record yet.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
