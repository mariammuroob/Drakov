import "server-only";

import { createClient } from "@supabase/supabase-js";

export type NetworkNode = {
  id: string;
  kind: "agent" | "company";
  name: string;
  value: number;
  status: string;
  href: string;
};

export type NetworkEdge = {
  id: string;
  source: string;
  target: string;
  kind: "investment" | "rivalry" | "founder" | "partnership";
  activeRivalry?: boolean;
};

export type NetworkData = {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  totals: { agents: number; companies: number; investments: number; rivalries: number };
  canRenderGraph: boolean;
};

const NODE_LIMIT = 24;

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function getNetworkData(): Promise<NetworkData> {
  const supabase = client();
  const [agentsResult, companiesResult, investmentsResult, rivalriesResult, partnershipsResult] = await Promise.all([
    supabase.from("agents").select("id, name, cash, status").in("status", ["independent", "founder", "employed"]).eq("is_flagged", false),
    supabase.from("companies").select("id, name, valuation, market, founder_agent_id, status").eq("status", "active"),
    supabase.from("investments").select("id, investor_agent_id, company_id, amount").order("amount", { ascending: false }),
    supabase.from("rivalries").select("id, agent_a_id, agent_b_id, relationship_type, intensity, updated_at").order("updated_at", { ascending: false }),
    supabase.from("partnerships").select("id, company_a_id, company_b_id"),
  ]);
  const error = [agentsResult.error, companiesResult.error, investmentsResult.error, rivalriesResult.error, partnershipsResult.error].find(Boolean);
  if (error) throw new Error(error.message);

  const agents = agentsResult.data ?? [];
  const companies = companiesResult.data ?? [];
  const investments = investmentsResult.data ?? [];
  const rivalries = rivalriesResult.data ?? [];
  const partnerships = partnershipsResult.data ?? [];
  const score = new Map<string, number>();
  const bump = (id: string, amount = 1) => score.set(id, (score.get(id) ?? 0) + amount);
  investments.forEach((item) => { bump(item.investor_agent_id, 2); bump(item.company_id, 2); });
  rivalries.forEach((item) => { bump(item.agent_a_id, 4 + item.intensity); bump(item.agent_b_id, 4 + item.intensity); });
  partnerships.forEach((item) => { bump(item.company_a_id); bump(item.company_b_id); });
  companies.forEach((item) => { bump(item.founder_agent_id); bump(item.id); });

  const candidates: NetworkNode[] = [
    ...agents.map((agent) => ({ id: agent.id, kind: "agent" as const, name: agent.name, value: Number(agent.cash), status: agent.status, href: `/agents/${agent.id}` })),
    ...companies.map((company) => ({ id: company.id, kind: "company" as const, name: company.name, value: Number(company.valuation), status: company.market, href: `/companies/${company.id}` })),
  ];
  const nodes = candidates
    .sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0) || b.value - a.value)
    .slice(0, NODE_LIMIT);
  const included = new Set(nodes.map((node) => node.id));
  const edges: NetworkEdge[] = [
    ...investments.map((item) => ({ id: `investment-${item.id}`, source: item.investor_agent_id, target: item.company_id, kind: "investment" as const })),
    ...rivalries.map((item) => ({ id: `rivalry-${item.id}`, source: item.agent_a_id, target: item.agent_b_id, kind: "rivalry" as const, activeRivalry: item.relationship_type === "rival" })),
    ...companies.map((item) => ({ id: `founder-${item.id}`, source: item.founder_agent_id, target: item.id, kind: "founder" as const })),
    ...partnerships.map((item) => ({ id: `partnership-${item.id}`, source: item.company_a_id, target: item.company_b_id, kind: "partnership" as const })),
  ].filter((edge) => included.has(edge.source) && included.has(edge.target));

  return {
    nodes,
    edges,
    totals: { agents: agents.length, companies: companies.length, investments: investments.length, rivalries: rivalries.length },
    canRenderGraph: nodes.length >= 6 && edges.length >= 3,
  };
}
