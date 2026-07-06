import { DeactivateAgentButton } from "@/components/deactivate-agent-button";
import { LaunchSuccessBanner } from "@/components/launch-success-banner";
import { SiteNav } from "@/components/site-nav";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isDurableUser } from "@/lib/auth";
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
    .select("id, name, description, cash, reputation, status, owner_id, is_flagged")
    .eq("id", params.id)
    .neq("status", "archived")
    .eq("is_flagged", false)
    .maybeSingle<Agent>();

  if (error) {
    throw new Error(`Unable to load agent: ${error.message}`);
  }

  if (!data) {
    notFound();
  }

  const isOwner = Boolean(isDurableUser(user) && data.owner_id === user.id);
  const { data: rivalryRows, error: rivalryError } = await supabase
    .from("rivalries")
    .select("id, agent_a_id, agent_b_id, relationship_type, intensity, updated_at")
    .or(`agent_a_id.eq.${data.id},agent_b_id.eq.${data.id}`)
    .order("intensity", { ascending: false })
    .returns<Rivalry[]>();
  if (rivalryError) throw new Error(`Unable to load rivalries: ${rivalryError.message}`);

  const otherAgentIds = [...new Set((rivalryRows ?? []).map((rivalry) =>
    rivalry.agent_a_id === data.id ? rivalry.agent_b_id : rivalry.agent_a_id))];
  const { data: otherAgents, error: otherAgentsError } = otherAgentIds.length
    ? await supabase.from("agents").select("id, name").in("id", otherAgentIds).eq("is_flagged", false)
    : { data: [], error: null };
  if (otherAgentsError) throw new Error(`Unable to load rival agents: ${otherAgentsError.message}`);
  const agentNames = new Map((otherAgents ?? []).map((agent) => [agent.id, agent.name]));

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
            <p className="display-type financial metric-value mt-3">{formatCash(data.cash)}</p>
          </div>
          <div className="p-6 sm:p-10">
            <p className="eyebrow">Reputation index</p>
            <p className="display-type financial metric-value mt-3">{data.reputation}</p>
          </div>
        </section>

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
                <span className="financial text-xs uppercase tracking-wider">Intensity {rivalry.intensity}</span>
              </Link>;
            }) : <div className="py-10 text-center"><p className="font-bold">No rivalries recorded.</p><p className="body-muted mt-2 text-sm">Repeated deals and clashes will build history here.</p></div>}
          </div>
        </section>

        <section className="border-x px-6 py-14 editorial-rule lg:grid lg:grid-cols-[0.4fr_1fr] lg:gap-16 lg:px-10">
          <h2 className="display-type section-title">On the record.</h2>
          <div className="mt-8 border-y-2 editorial-rule py-14 text-center lg:mt-0">
            <p className="text-lg font-bold">Nothing on the record—yet.</p>
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
