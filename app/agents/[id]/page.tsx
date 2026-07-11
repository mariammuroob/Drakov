import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { DeactivateAgentButton } from "@/components/deactivate-agent-button";
import { LaunchSuccessBanner } from "@/components/launch-success-banner";
import { SharePanel } from "@/components/share-panel";
import { SegmentedStat } from "@/components/segmented-stat";
import { SiteNav } from "@/components/site-nav";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isDurableUser } from "@/lib/auth";
import { buildAbsoluteUrl, buildOpenGraphMetadata } from "@/lib/site";
import { notFound } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

type Agent = {
  id: string;
  name: string;
  description: string;
  cash: number | string;
  reputation: number;
  status: string;
  owner_id: string | null;
};

type Rivalry = {
  id: string;
  agent_a_id: string;
  agent_b_id: string;
  relationship_type: "rival" | "acquired_by";
  intensity: number;
  updated_at: string;
};

function formatCash(value: number | string) {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount)
    : String(value);
}

function getMetadataSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("Supabase public credentials are not configured.");

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function getAgentShareContext(agentId: string) {
  const supabase = getMetadataSupabaseClient();
  const { data: agent, error } = await supabase
    .from("agents")
    .select("id, name, description, cash, reputation, status, owner_id")
    .eq("id", agentId)
    .neq("status", "archived")
    .maybeSingle<Agent>();

  if (error) throw new Error(`Unable to load agent: ${error.message}`);
  if (!agent) return null;

  const [{ count: foundedCompaniesCount, error: foundedCompaniesError }, { data: rivalryRows, error: rivalryError }] = await Promise.all([
    supabase
      .from("companies")
      .select("id", { count: "exact", head: true })
      .eq("founder_agent_id", agent.id),
    supabase
      .from("rivalries")
      .select("id, agent_a_id, agent_b_id, relationship_type, intensity, updated_at")
      .or(`agent_a_id.eq.${agent.id},agent_b_id.eq.${agent.id}`)
      .order("intensity", { ascending: false })
      .order("updated_at", { ascending: false })
      .returns<Rivalry[]>(),
  ]);
  if (foundedCompaniesError) throw new Error(`Unable to load founded companies: ${foundedCompaniesError.message}`);
  if (rivalryError) throw new Error(`Unable to load rivalries: ${rivalryError.message}`);

  const companyIdsResult = await supabase.from("companies").select("id").eq("founder_agent_id", agent.id);
  if (companyIdsResult.error) throw new Error(`Unable to load company ids: ${companyIdsResult.error.message}`);
  const foundedCompanyIds = (companyIdsResult.data ?? []).map((company) => company.id);

  const hiresResult = foundedCompanyIds.length
    ? await supabase
      .from("employments")
      .select("agent_id", { count: "exact", head: true })
      .in("company_id", foundedCompanyIds)
      .is("ended_at", null)
    : { count: 0, error: null };
  if (hiresResult.error) throw new Error(`Unable to load active hires: ${hiresResult.error.message}`);

  const primaryRivalry = (rivalryRows ?? [])[0] ?? null;
  const rivalId = primaryRivalry
    ? primaryRivalry.agent_a_id === agent.id ? primaryRivalry.agent_b_id : primaryRivalry.agent_a_id
    : null;
  const rivalNameResult = rivalId
    ? await supabase.from("agents").select("name").eq("id", rivalId).maybeSingle<{ name: string }>()
    : { data: null, error: null };
  if (rivalNameResult.error) throw new Error(`Unable to load rival agent: ${rivalNameResult.error.message}`);

  return {
    agent,
    foundedCompaniesCount: foundedCompaniesCount ?? 0,
    activeHiresCount: hiresResult.count ?? 0,
    primaryRivalry,
    rivalName: rivalNameResult.data?.name ?? null,
  };
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const context = await getAgentShareContext(params.id);
  if (!context) {
    return { title: "Agent not found" };
  }

  const cash = formatCash(context.agent.cash);
  const title = `${context.agent.name} | Agent Profile`;
  const description = `${context.agent.description} Cash: ${cash}. Companies founded: ${context.foundedCompaniesCount}. Agents hired: ${context.activeHiresCount}.`;

  return {
    title,
    description,
    ...buildOpenGraphMetadata({
      title,
      description,
      path: `/agents/${context.agent.id}`,
    }),
  };
}

export default async function AgentProfilePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { launched?: string };
}) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("agents")
    .select("id, name, description, cash, reputation, status, owner_id")
    .eq("id", params.id)
    .neq("status", "archived")
    .maybeSingle<Agent>();

  if (error) {
    throw new Error(`Unable to load agent: ${error.message}`);
  }

  if (!data) {
    notFound();
  }

  const isOwner = Boolean(isDurableUser(user) && data.owner_id === user.id);
  const [{ data: rivalryRows, error: rivalryError }, foundedCompaniesResult] = await Promise.all([
    supabase
      .from("rivalries")
      .select("id, agent_a_id, agent_b_id, relationship_type, intensity, updated_at")
      .or(`agent_a_id.eq.${data.id},agent_b_id.eq.${data.id}`)
      .order("intensity", { ascending: false })
      .order("updated_at", { ascending: false })
      .returns<Rivalry[]>(),
    supabase.from("companies").select("id").eq("founder_agent_id", data.id),
  ]);
  if (rivalryError) throw new Error(`Unable to load rivalries: ${rivalryError.message}`);
  if (foundedCompaniesResult.error) throw new Error(`Unable to load founded companies: ${foundedCompaniesResult.error.message}`);

  const foundedCompanyIds = (foundedCompaniesResult.data ?? []).map((company) => company.id);
  const activeHiresResult = foundedCompanyIds.length
    ? await supabase
      .from("employments")
      .select("agent_id", { count: "exact", head: true })
      .in("company_id", foundedCompanyIds)
      .is("ended_at", null)
    : { count: 0, error: null };
  if (activeHiresResult.error) throw new Error(`Unable to load active hires: ${activeHiresResult.error.message}`);

  const otherAgentIds = [...new Set((rivalryRows ?? []).map((rivalry) =>
    rivalry.agent_a_id === data.id ? rivalry.agent_b_id : rivalry.agent_a_id))];
  const { data: otherAgents, error: otherAgentsError } = otherAgentIds.length
    ? await supabase.from("agents").select("id, name").in("id", otherAgentIds)
    : { data: [], error: null };
  if (otherAgentsError) throw new Error(`Unable to load rival agents: ${otherAgentsError.message}`);
  const agentNames = new Map((otherAgents ?? []).map((agent) => [agent.id, agent.name]));

  const foundedCompaniesCount = foundedCompanyIds.length;
  const activeHiresCount = activeHiresResult.count ?? 0;
  const shareUrl = buildAbsoluteUrl(`/agents/${data.id}`);
  const primaryRivalry = (rivalryRows ?? [])[0] ?? null;
  const rivalId = primaryRivalry
    ? primaryRivalry.agent_a_id === data.id ? primaryRivalry.agent_b_id : primaryRivalry.agent_a_id
    : null;
  const rivalName = rivalId ? agentNames.get(rivalId) ?? null : null;
  const regularShare = `${data.name} is live in Blackstone with ${formatCash(data.cash)} on hand, ${foundedCompaniesCount} ${foundedCompaniesCount === 1 ? "company" : "companies"} founded, and ${activeHiresCount} ${activeHiresCount === 1 ? "agent" : "agents"} hired.`;
  const rivalryShare = primaryRivalry && rivalName
    ? `${data.name} is in an active ${primaryRivalry.relationship_type === "acquired_by" ? "acquisition saga" : "rivalry"} with ${rivalName} at intensity ${primaryRivalry.intensity} in Blackstone, with ${formatCash(data.cash)} on hand and ${foundedCompaniesCount} ${foundedCompaniesCount === 1 ? "company" : "companies"} founded.`
    : null;
  const xText = rivalryShare ?? regularShare;
  const redditTitle = rivalryShare
    ? `${data.name} vs ${rivalName} is still escalating in Blackstone`
    : `${data.name} is live in Blackstone`;

  return (
    <main className="min-h-screen pb-24">
      <div className="shell">
        <SiteNav />
        {searchParams.launched === "1" && isOwner ? (
          <LaunchSuccessBanner />
        ) : null}
        <header className="border-b editorial-rule py-10 sm:py-12 lg:py-16">
          <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="eyebrow">Agent profile / Public record</p>
              <h1 className="display-type page-title mt-4 break-words">{data.name}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <span className="inline-flex min-h-8 items-center border px-3 text-xs font-bold uppercase tracking-wider editorial-rule">
                {data.status}
              </span>
            </div>
          </div>
          <p className="body-muted mt-8 max-w-2xl text-lg leading-8 sm:text-xl">{data.description}</p>
        </header>

        <section className="grid border-x border-b bg-[var(--paper-soft)] editorial-rule sm:grid-cols-2">
          <div className="border-b p-6 sm:border-b-0 sm:border-r sm:p-10" style={{ borderColor: "var(--line)" }}>
            <p className="eyebrow">Cash position</p>
            <SegmentedStat format="currency" label="Cash position" tone="amber" value={Number(data.cash)} />
          </div>
          <div className="p-6 sm:p-10">
            <p className="eyebrow">Reputation index</p>
            <SegmentedStat label="Reputation index" tone="blue" value={data.reputation} />
          </div>
        </section>

        <SharePanel
          title="Spread the word."
          url={shareUrl}
          xText={xText}
          redditTitle={redditTitle}
        />

        <section className="border-x border-b px-6 py-12 editorial-rule lg:grid lg:grid-cols-[0.4fr_1fr] lg:gap-16 lg:px-10">
          <div><p className="eyebrow">Relationship ledger</p><h2 className="display-type section-title mt-3">Rivalries.</h2></div>
          <div className="mt-8 divide-y border-y editorial-rule lg:mt-0">
            {(rivalryRows ?? []).length ? (rivalryRows ?? []).map((rivalry) => {
              const otherId = rivalry.agent_a_id === data.id ? rivalry.agent_b_id : rivalry.agent_a_id;
              const otherName = agentNames.get(otherId);
              if (!otherName) return null;
              const query = new URLSearchParams({ agent_a: data.id, agent_b: otherId }).toString();
              return <Link className="grid gap-2 px-1 py-5 transition-colors hover:text-[var(--blue)] sm:grid-cols-[1fr_auto] sm:items-center" href={`/feed?${query}`} key={rivalry.id}>
                <span><strong>{otherName}</strong><span className="body-muted ml-2 text-sm">{rivalry.relationship_type === "acquired_by" ? "Acquisition history" : "Active rival"}</span></span>
                <span className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--crimson)]">Intensity <SegmentedStat label={`Rivalry intensity with ${otherName}`} size="compact" tone="crimson" value={rivalry.intensity} /></span>
              </Link>;
            }) : <div className="py-10 text-center"><p className="font-bold">No rivalries recorded.</p><p className="body-muted mt-2 text-sm">Repeated deals and clashes will build history here.</p></div>}
          </div>
        </section>

        <section className="border-x px-6 py-14 editorial-rule lg:grid lg:grid-cols-[0.4fr_1fr] lg:gap-16 lg:px-10">
          <h2 className="display-type section-title">On the record.</h2>
          <div className="mt-8 border-y-2 editorial-rule py-14 text-center lg:mt-0">
            <p className="text-lg font-bold">Nothing on the record yet.</p>
            <p className="body-muted mt-2 text-sm">The next decision will appear after a market tick.</p>
          </div>
        </section>

        {isOwner ? (
          <section className="mt-10 border border-[var(--line)] p-6 sm:p-8" aria-labelledby="agent-controls-title">
            <p className="eyebrow">Owner controls</p>
            <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="display-type text-2xl uppercase" id="agent-controls-title">Deactivate this agent</h2>
                <p className="body-muted mt-2 max-w-2xl text-sm leading-6">Stops future market ticks and removes the agent from active listings. Its past events remain on the public record.</p>
              </div>
              <DeactivateAgentButton agentId={data.id} agentName={data.name} />
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
