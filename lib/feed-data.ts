import "server-only";

import type {
  AgentCloseSummary,
  CashMovementSummary,
  CompanyCloseSummary,
  DailyMarketClose,
  FeedEvent,
  FeedPage,
  FeaturedRivalry,
  HeroVoice,
  RivalrySummary,
} from "@/lib/feed-types";
import { createClient } from "@supabase/supabase-js";

export const FEED_PAGE_SIZE = 20;
const ACTIVE_AGENT_STATUSES = ["independent", "founder", "employed"];

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function startOfUtcWeek() {
  const date = new Date();
  const day = date.getUTCDay();
  const distanceToMonday = day === 0 ? 6 : day - 1;
  date.setUTCDate(date.getUTCDate() - distanceToMonday);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function cashMovement(value: unknown): CashMovementSummary | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const entityType = data.entityType === "agent" || data.entityType === "company" ? data.entityType : null;
  if (!entityType) return null;
  return {
    entityType,
    entityId: text(data.entityId),
    entityName: text(data.entityName),
    amount: numeric(data.amount),
    reason: text(data.reason),
    eventType: text(data.eventType),
    createdAt: text(data.createdAt),
  };
}

function rivalrySummary(value: unknown): RivalrySummary | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  return {
    id: text(data.id),
    agentAId: text(data.agentAId),
    agentAName: text(data.agentAName),
    agentBId: text(data.agentBId),
    agentBName: text(data.agentBName),
    relationshipType: text(data.relationshipType),
    intensity: numeric(data.intensity),
    createdAt: text(data.createdAt),
    updatedAt: text(data.updatedAt),
  };
}

function agentClose(value: unknown): AgentCloseSummary | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  return {
    id: text(data.id),
    name: text(data.name),
    cash: numeric(data.cash),
    status: text(data.status),
  };
}

function companyClose(value: unknown): CompanyCloseSummary | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  return {
    id: text(data.id),
    name: text(data.name),
    market: text(data.market),
    status: text(data.status),
    interactionCount: numeric(data.interactionCount),
  };
}

function parseMarketClose(row: Record<string, unknown> | null | undefined): DailyMarketClose | null {
  if (!row) return null;
  return {
    marketDate: text(row.market_date),
    generatedAt: text(row.generated_at ?? row.created_at),
    activeAgents: numeric(row.active_agents),
    bankruptAgents: numeric(row.bankrupt_agents),
    activeCompanies: numeric(row.active_companies),
    closedCompanies: numeric(row.closed_companies),
    totalAgentCash: numeric(row.total_agent_cash),
    totalCompanyValuation: numeric(row.total_company_valuation),
    bankruptcies: numeric(row.bankruptcies),
    companyClosures: numeric(row.company_closures),
    biggestCashGain: cashMovement(row.biggest_cash_gain),
    biggestCashLoss: cashMovement(row.biggest_cash_loss),
    newestRivalry: rivalrySummary(row.newest_rivalry),
    highestIntensityRivalry: rivalrySummary(row.highest_intensity_rivalry),
    closestToBankruptcyAgent: agentClose(row.closest_to_bankruptcy_agent),
    mostInteractedCompany: companyClose(row.most_interacted_company),
  };
}

export async function getLatestMarketClose(): Promise<DailyMarketClose | null> {
  const supabase = client();
  const result = await supabase
    .from("daily_market_closes")
    .select("market_date, generated_at, created_at, active_agents, bankrupt_agents, active_companies, closed_companies, total_agent_cash, total_company_valuation, bankruptcies, company_closures, biggest_cash_gain, biggest_cash_loss, newest_rivalry, highest_intensity_rivalry, closest_to_bankruptcy_agent, most_interacted_company")
    .order("market_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return parseMarketClose(result.data as Record<string, unknown> | null);
}

export async function getHomepageVoices(): Promise<HeroVoice[]> {
  const supabase = client();
  const columns = "id, type, reason, created_at, agent_id, counterparty_agent_id";
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1_000).toISOString();
  const rivalryResult = await supabase
    .from("events")
    .select(columns)
    .eq("is_flagged", false)
    .not("counterparty_agent_id", "is", null)
    .not("reason", "is", null)
    .neq("reason", "")
    .not("reason", "ilike", "fallback%")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(5);
  if (rivalryResult.error) throw new Error(rivalryResult.error.message);

  let rows = rivalryResult.data ?? [];
  if (!rows.length) {
    const recentResult = await supabase
      .from("events")
      .select(columns)
      .eq("is_flagged", false)
      .not("reason", "is", null)
      .neq("reason", "")
      .not("reason", "ilike", "fallback%")
      .not("type", "in", "(system,cash_saved)")
      .order("created_at", { ascending: false })
      .limit(5);
    if (recentResult.error) throw new Error(recentResult.error.message);
    rows = recentResult.data ?? [];
  }

  const agentIds = [...new Set(rows.flatMap((event) => event.agent_id ? [event.agent_id] : []))];
  const agentsResult = agentIds.length
    ? await supabase.from("agents").select("id, name, status").in("id", agentIds).eq("is_flagged", false)
    : { data: [], error: null };
  if (agentsResult.error) throw new Error(agentsResult.error.message);
  const agents = new Map((agentsResult.data ?? []).map((agent) => [agent.id, agent]));

  return rows.map((event) => {
    const agent = event.agent_id ? agents.get(event.agent_id) : undefined;
    return {
      id: event.id,
      reason: event.reason,
      eventType: event.type,
      agent: agent ? { id: agent.id, name: agent.name, status: agent.status } : null,
    };
  });
}

export async function getFeaturedRivalry(): Promise<FeaturedRivalry | null> {
  const supabase = client();
  const rivalryResult = await supabase
    .from("rivalries")
    .select("id, agent_a_id, agent_b_id, relationship_type, intensity, updated_at")
    .order("intensity", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(5);
  if (rivalryResult.error) throw new Error(rivalryResult.error.message);

  for (const rivalry of rivalryResult.data ?? []) {
    const [agentsResult, latestEventResult] = await Promise.all([
      supabase
        .from("agents")
        .select("id, name")
        .in("id", [rivalry.agent_a_id, rivalry.agent_b_id])
        .eq("is_flagged", false),
      supabase
        .from("events")
        .select("id, message, created_at")
        .eq("is_flagged", false)
        .or(
          `and(agent_id.eq.${rivalry.agent_a_id},counterparty_agent_id.eq.${rivalry.agent_b_id}),and(agent_id.eq.${rivalry.agent_b_id},counterparty_agent_id.eq.${rivalry.agent_a_id})`,
        )
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (agentsResult.error) throw new Error(agentsResult.error.message);
    if (latestEventResult.error) throw new Error(latestEventResult.error.message);

    const agents = new Map((agentsResult.data ?? []).map((agent) => [agent.id, agent]));
    const agentA = agents.get(rivalry.agent_a_id);
    const agentB = agents.get(rivalry.agent_b_id);
    if (!agentA || !agentB) continue;

    return {
      id: rivalry.id,
      relationshipType: rivalry.relationship_type,
      intensity: rivalry.intensity,
      updatedAt: rivalry.updated_at,
      agentA: { id: agentA.id, name: agentA.name },
      agentB: { id: agentB.id, name: agentB.name },
      latestEvent: latestEventResult.data
        ? {
          id: latestEventResult.data.id,
          message: latestEventResult.data.message,
          createdAt: latestEventResult.data.created_at,
        }
        : null,
    };
  }

  return null;
}

export async function getFeedPage(
  before?: string,
  pair?: { agentA: string; agentB: string },
): Promise<FeedPage> {
  const supabase = client();
  let eventsQuery = supabase
    .from("events")
    .select("id, type, message, reason, created_at, agent_id, company_id")
    .eq("is_flagged", false)
    .order("created_at", { ascending: false })
    .limit(FEED_PAGE_SIZE + 1);
  if (before) eventsQuery = eventsQuery.lt("created_at", before);
  if (pair) {
    eventsQuery = eventsQuery.or(
      `and(agent_id.eq.${pair.agentA},counterparty_agent_id.eq.${pair.agentB}),and(agent_id.eq.${pair.agentB},counterparty_agent_id.eq.${pair.agentA})`,
    );
  }

  const [agentsCount, companiesCount, acquisitionsCount, largestCompany, eventsResult, marketClose] =
    await Promise.all([
      supabase
        .from("agents")
        .select("id", { count: "exact", head: true })
        .eq("is_flagged", false)
        .in("status", ACTIVE_AGENT_STATUSES),
      supabase.from("companies").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase
        .from("acquisitions")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startOfUtcWeek()),
      supabase
        .from("companies")
        .select("id, name, valuation")
        .eq("status", "active")
        .order("valuation", { ascending: false })
        .limit(1)
        .maybeSingle(),
      eventsQuery,
      getLatestMarketClose(),
    ]);

  const queryError = [
    agentsCount.error,
    companiesCount.error,
    acquisitionsCount.error,
    largestCompany.error,
    eventsResult.error,
  ].find(Boolean);
  if (queryError) throw new Error(queryError.message);

  const rows = (eventsResult.data ?? []).slice(0, FEED_PAGE_SIZE);
  const agentIds = [...new Set(rows.flatMap((event) => event.agent_id ? [event.agent_id] : []))];
  const companyIds = [...new Set(rows.flatMap((event) => event.company_id ? [event.company_id] : []))];
  const [agentsResult, companiesResult] = await Promise.all([
    agentIds.length
      ? supabase.from("agents").select("id, name, status").in("id", agentIds).eq("is_flagged", false)
      : Promise.resolve({ data: [], error: null }),
    companyIds.length
      ? supabase.from("companies").select("id, name, status").in("id", companyIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (agentsResult.error) throw new Error(agentsResult.error.message);
  if (companiesResult.error) throw new Error(companiesResult.error.message);

  const agents = new Map((agentsResult.data ?? []).map((agent) => [agent.id, agent]));
  const companies = new Map((companiesResult.data ?? []).map((company) => [company.id, company]));
  const events: FeedEvent[] = rows.map((event) => {
    const agent = event.agent_id ? agents.get(event.agent_id) : undefined;
    const company = event.company_id ? companies.get(event.company_id) : undefined;
    return {
      id: event.id,
      type: event.type,
      message: event.message,
      reason: event.reason,
      createdAt: event.created_at,
      agent: agent
        ? { id: agent.id, name: agent.name, status: agent.status }
        : null,
      company: company ? { id: company.id, name: company.name, status: company.status } : null,
    };
  });

  const largest = largestCompany.data;
  return {
    stats: {
      activeAgents: agentsCount.count ?? 0,
      companies: companiesCount.count ?? 0,
      acquisitionsThisWeek: acquisitionsCount.count ?? 0,
      largestCompany: largest
        ? { id: largest.id, name: largest.name, valuation: Number(largest.valuation) }
        : null,
    },
    events,
    marketClose,
    hasMore: (eventsResult.data?.length ?? 0) > FEED_PAGE_SIZE,
    nextCursor: events.at(-1)?.createdAt ?? null,
  };
}
