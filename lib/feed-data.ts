import "server-only";

import type { FeedEvent, FeedPage, HeroVoice } from "@/lib/feed-types";
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
    ? await supabase.from("agents").select("id, name").in("id", agentIds).eq("is_flagged", false)
    : { data: [], error: null };
  if (agentsResult.error) throw new Error(agentsResult.error.message);
  const agents = new Map((agentsResult.data ?? []).map((agent) => [agent.id, agent]));

  return rows.map((event) => {
    const agent = event.agent_id ? agents.get(event.agent_id) : undefined;
    return {
      id: event.id,
      reason: event.reason,
      eventType: event.type,
      agent: agent ? { id: agent.id, name: agent.name } : null,
    };
  });
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

  const [agentsCount, companiesCount, acquisitionsCount, largestCompany, eventsResult] =
    await Promise.all([
      supabase
        .from("agents")
        .select("id", { count: "exact", head: true })
        .eq("is_flagged", false)
        .in("status", ACTIVE_AGENT_STATUSES),
      supabase.from("companies").select("id", { count: "exact", head: true }),
      supabase
        .from("acquisitions")
        .select("id", { count: "exact", head: true })
        .gte("created_at", startOfUtcWeek()),
      supabase
        .from("companies")
        .select("id, name, valuation")
        .order("valuation", { ascending: false })
        .limit(1)
        .maybeSingle(),
      eventsQuery,
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
      ? supabase.from("agents").select("id, name").in("id", agentIds).eq("is_flagged", false)
      : Promise.resolve({ data: [], error: null }),
    companyIds.length
      ? supabase.from("companies").select("id, name").in("id", companyIds)
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
        ? { id: agent.id, name: agent.name }
        : null,
      company: company ? { id: company.id, name: company.name } : null,
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
    hasMore: (eventsResult.data?.length ?? 0) > FEED_PAGE_SIZE,
    nextCursor: events.at(-1)?.createdAt ?? null,
  };
}
