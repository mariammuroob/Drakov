import "server-only";

import type {
  Leaderboards,
  RankedAgent,
  RankedEmployee,
  RankedFounder,
} from "@/lib/leaderboard-types";
import { createClient } from "@supabase/supabase-js";

const LIMIT = 10;

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function getLeaderboards(): Promise<Leaderboards> {
  const supabase = client();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000).toISOString();
  const [agentsResult, companiesResult, investmentsResult, employmentsResult, snapshotsResult] =
    await Promise.all([
      supabase.from("agents").select("id, name, cash, is_quick_agent"),
      supabase.from("companies").select("id, name, founder_agent_id, valuation, market"),
      supabase.from("investments").select("investor_agent_id, company_id, amount, ownership_pct"),
      supabase
        .from("employments")
        .select("agent_id, company_id, role, salary")
        .is("ended_at", null),
      supabase
        .from("company_valuation_snapshots")
        .select("company_id, valuation, captured_at")
        .gte("captured_at", sevenDaysAgo)
        .order("captured_at", { ascending: true }),
    ]);

  const error = [
    agentsResult.error,
    companiesResult.error,
    investmentsResult.error,
    employmentsResult.error,
    snapshotsResult.error,
  ].find(Boolean);
  if (error) throw new Error(error.message);

  const agents = agentsResult.data ?? [];
  const companies = companiesResult.data ?? [];
  const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
  const companyMap = new Map(companies.map((company) => [company.id, company]));
  const rankedAgent = (agentId: string, value: number): RankedAgent | null => {
    const agent = agentMap.get(agentId);
    return agent
      ? { id: agent.id, name: agent.name, isQuickAgent: agent.is_quick_agent, value }
      : null;
  };

  const richestAgents = agents
    .map((agent) => ({
      id: agent.id,
      name: agent.name,
      isQuickAgent: agent.is_quick_agent,
      value: Number(agent.cash),
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, LIMIT);

  const biggestCompanies = companies
    .map((company) => ({
      id: company.id,
      name: company.name,
      value: Number(company.valuation),
      secondary: company.market,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, LIMIT);

  const founderTotals = new Map<string, { companyCount: number; valuation: number }>();
  for (const company of companies) {
    const current = founderTotals.get(company.founder_agent_id) ?? {
      companyCount: 0,
      valuation: 0,
    };
    current.companyCount += 1;
    current.valuation += Number(company.valuation);
    founderTotals.set(company.founder_agent_id, current);
  }
  const bestFounders = [...founderTotals.entries()]
    .flatMap(([agentId, total]) => {
      const agent = rankedAgent(agentId, total.valuation);
      return agent ? [{ ...agent, companyCount: total.companyCount } satisfies RankedFounder] : [];
    })
    .sort((a, b) => b.value - a.value || b.companyCount - a.companyCount)
    .slice(0, LIMIT);

  const investorReturns = new Map<string, number>();
  for (const investment of investmentsResult.data ?? []) {
    const company = companyMap.get(investment.company_id);
    if (!company) continue;
    const markedValue = Number(company.valuation) * (Number(investment.ownership_pct) / 100);
    const totalReturn = markedValue - Number(investment.amount);
    investorReturns.set(
      investment.investor_agent_id,
      (investorReturns.get(investment.investor_agent_id) ?? 0) + totalReturn,
    );
  }
  const bestInvestors = [...investorReturns.entries()]
    .flatMap(([agentId, value]) => {
      const agent = rankedAgent(agentId, value);
      return agent ? [agent] : [];
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, LIMIT);

  const highestPaidEmployees: RankedEmployee[] = (employmentsResult.data ?? [])
    .flatMap((employment) => {
      const agent = rankedAgent(employment.agent_id, Number(employment.salary));
      const company = companyMap.get(employment.company_id);
      return agent && company
        ? [{
            ...agent,
            companyId: company.id,
            companyName: company.name,
            role: employment.role,
          }]
        : [];
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, LIMIT);

  const baseline = new Map<string, number>();
  for (const snapshot of snapshotsResult.data ?? []) {
    if (!baseline.has(snapshot.company_id)) {
      baseline.set(snapshot.company_id, Number(snapshot.valuation));
    }
  }
  const fastestGrowing = companies
    .map((company) => ({
      id: company.id,
      name: company.name,
      value: Number(company.valuation) - (baseline.get(company.id) ?? Number(company.valuation)),
      secondary: company.market,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, LIMIT);

  return {
    richestAgents,
    biggestCompanies,
    bestFounders,
    bestInvestors,
    highestPaidEmployees,
    fastestGrowing,
  };
}
