import "server-only";

import * as Sentry from "@sentry/nextjs";
import { createClient } from "@supabase/supabase-js";
import type { AgentActionResponse } from "@/lib/call-agent";
import { callAgent } from "@/lib/call-agent";
import { callAcquisitionDecision } from "@/lib/call-acquisition-decision";
import { decideNpcAction, type NpcArchetype } from "@/lib/npc-rules";
import { checkRateLimit, hashIdentifier } from "@/lib/rate-limit";
import { inngest } from "@/lib/inngest/client";
import { TICK_INTERVAL_HOURS } from "@/lib/tick-schedule";

const WORK_BATCH_SIZE = 10;
const ACTIVE_AGENT_STATUSES = ["independent", "founder", "employed"];

type TickError = { agentId?: string; phase: string; message: string };
type Agent = { id: string; name: string; endpoint_url: string | null; cash: number | string; reputation: number; status: string };
type Company = { id: string; founder_agent_id: string; name: string; market: string; cash: number | string; revenue: number | string; valuation: number | string };
type WorkPayload =
  | { kind: "action"; gameState: Record<string, unknown> }
  | { kind: "acquisition"; acquisitionId: string; gameState: Record<string, unknown> }
  | { kind: "npc"; decision: Record<string, unknown> };

function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function reportTickFailure(error: unknown, context: TickError & { tickKey: string }) {
  const exception = error instanceof Error ? error : new Error(context.message);
  console.error("Blackstone tick step failed", context);
  Sentry.captureException(exception, {
    tags: { operation: "tick", phase: context.phase },
    extra: { tickKey: context.tickKey, agentId: context.agentId, message: context.message },
  });
}

function chunks<T>(items: T[], size = WORK_BATCH_SIZE) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function batchEvents(kind: "real" | "npc", tickRunId: string, currentTickKey: string, agentIds: string[]) {
  return chunks(agentIds).map((ids, index) => ({
    id: `blackstone-${kind}-batch:${currentTickKey}:${index}`,
    name: kind === "real" ? "blackstone/tick.real-batch" : "blackstone/tick.npc-batch",
    data: { tickRunId, tickKey: currentTickKey, agentIds: ids },
  }));
}

function hotMarket(companies: Company[]) {
  const revenue = new Map<string, number>();
  for (const company of companies) revenue.set(company.market, (revenue.get(company.market) ?? 0) + Number(company.revenue));
  return [...revenue.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

async function canCallAgentEndpoint(endpointUrl: string, currentTickKey: string) {
  const result = await checkRateLimit(`endpoint:${hashIdentifier(endpointUrl)}:${currentTickKey}`, {
    prefix: "tick:endpoint:per-interval",
    limit: 1,
    window: `${TICK_INTERVAL_HOURS} h`,
  });
  return result.success;
}

async function reserveRealAgents(currentTickKey: string) {
  const supabase = serviceClient();
  const { data: tickRun, error: tickError } = await supabase.from("tick_runs").insert({ tick_key: currentTickKey })
    .select("id").single();
  if (tickError?.code === "23505") return { skipped: true as const, tickRunId: null, agentIds: [] as string[] };
  if (tickError || !tickRun) throw new Error(tickError?.message ?? "Could not create tick run.");

  const cutoff = new Date(new Date(currentTickKey).getTime() - TICK_INTERVAL_HOURS * 60 * 60 * 1_000).toISOString();
  const [agentsResult, companiesResult, employmentsResult, jobsResult, acquisitionsResult] = await Promise.all([
    supabase.from("agents").select("id, name, endpoint_url, cash, reputation, status").eq("is_npc", false).eq("is_flagged", false)
      .in("status", ACTIVE_AGENT_STATUSES).order("created_at", { ascending: true }),
    supabase.from("companies").select("id, founder_agent_id, name, market, cash, revenue, valuation"),
    supabase.from("employments").select("id, agent_id, company_id, role, salary, equity_pct, started_at").is("ended_at", null),
    supabase.from("jobs").select("id, company_id, title, salary, equity_pct").eq("status", "open"),
    supabase.from("acquisitions").select("id, acquirer_company_id, target_company_id, offer_amount, created_at")
      .eq("status", "pending").lt("created_at", cutoff).order("created_at", { ascending: true }),
  ]);
  const queryError = [agentsResult.error, companiesResult.error, employmentsResult.error, jobsResult.error, acquisitionsResult.error].find(Boolean);
  if (queryError) throw new Error(queryError.message);

  const agents = (agentsResult.data ?? []) as Agent[];
  const companies = (companiesResult.data ?? []) as Company[];
  const employments = employmentsResult.data ?? [];
  const jobs = jobsResult.data ?? [];
  const acquisitions = acquisitionsResult.data ?? [];
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  const companiesById = new Map(companies.map((company) => [company.id, company]));
  const reservations = new Map<string, WorkPayload>();

  for (const acquisition of acquisitions) {
    const target = companiesById.get(acquisition.target_company_id);
    const acquirer = companiesById.get(acquisition.acquirer_company_id);
    const agent = target ? agentsById.get(target.founder_agent_id) : undefined;
    if (!agent || !agent.endpoint_url || !target || !acquirer || reservations.has(agent.id)) continue;
    reservations.set(agent.id, {
      kind: "acquisition",
      acquisitionId: acquisition.id,
      gameState: {
        request_type: "acquisition_decision",
        agent: { id: agent.id, cash: Number(agent.cash), reputation: agent.reputation },
        offer: { acquisition_id: acquisition.id, acquirer, target, offer_amount: Number(acquisition.offer_amount) },
        allowed_decisions: ["accept", "reject", "counter"],
      },
    });
  }

  const hottestMarket = hotMarket(companies);
  for (const agent of agents) {
    if (!agent.endpoint_url || reservations.has(agent.id)) continue;
    const foundedCompanies = companies.filter((company) => company.founder_agent_id === agent.id);
    reservations.set(agent.id, {
      kind: "action",
      gameState: {
        tick: currentTickKey,
        agent: { id: agent.id, name: agent.name, cash: Number(agent.cash), reputation: agent.reputation, status: agent.status },
        employment: employments.find((item) => item.agent_id === agent.id) ?? null,
        company: foundedCompanies[0] ?? null,
        companies: foundedCompanies,
        hot_market_sector: hottestMarket,
        available_offers: {
          jobs,
          acquisitions: acquisitions.filter((offer) => foundedCompanies.some((company) => company.id === offer.target_company_id)),
        },
      },
    });
  }

  const rows = [...reservations].map(([agentId, payload]) => ({ tick_run_id: tickRun.id, agent_id: agentId, action: "pending", payload }));
  if (rows.length) {
    const { error } = await supabase.from("agent_tick_actions").insert(rows);
    if (error) throw new Error(error.message);
  }
  return { skipped: false as const, tickRunId: tickRun.id, agentIds: [...reservations.keys()] };
}

async function reserveNpcAgents(tickRunId: string) {
  const supabase = serviceClient();
  const [agentsResult, profilesResult, companiesResult] = await Promise.all([
    supabase.from("agents").select("id, name, cash, status").eq("is_npc", true).neq("status", "bankrupt").neq("status", "archived")
      .eq("is_flagged", false).order("created_at", { ascending: true }),
    supabase.from("npc_profiles").select("agent_id, archetype, config, ticks_acted"),
    supabase.from("companies").select("id, founder_agent_id, name, cash, valuation"),
  ]);
  const queryError = [agentsResult.error, profilesResult.error, companiesResult.error].find(Boolean);
  if (queryError) throw new Error(queryError.message);
  const companies = (companiesResult.data ?? []).map((company) => ({ ...company, cash: Number(company.cash), valuation: Number(company.valuation) }));
  const profiles = new Map((profilesResult.data ?? []).map((profile) => [profile.agent_id, profile]));
  const rows = [];
  for (const agent of agentsResult.data ?? []) {
    const profile = profiles.get(agent.id);
    if (!profile) continue;
    const decision = decideNpcAction(
      { ...agent, cash: Number(agent.cash) },
      { archetype: profile.archetype as NpcArchetype, config: profile.config as Record<string, unknown>, ticks_acted: profile.ticks_acted },
      companies,
    );
    rows.push({ tick_run_id: tickRunId, agent_id: agent.id, action: "pending", payload: { kind: "npc", decision } });
  }
  if (rows.length) {
    const { error } = await supabase.from("agent_tick_actions").upsert(rows, { onConflict: "tick_run_id,agent_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  return rows.map((row) => row.agent_id);
}

async function markFailed(tickRunId: string, agentId: string, action: string, message: string) {
  const { error } = await serviceClient().rpc("fail_tick_agent_action", {
    p_tick_run_id: tickRunId, p_agent_id: agentId, p_action: action, p_error: message,
  });
  if (error) throw new Error(`Could not finalize failed tick action: ${error.message}`);
}

async function processRealAgent(tickRunId: string, currentTickKey: string, agentId: string) {
  const supabase = serviceClient();
  const { data: reservation, error } = await supabase.from("agent_tick_actions").select("completed_at, payload, agents!inner(endpoint_url)")
    .eq("tick_run_id", tickRunId).eq("agent_id", agentId).single();
  if (error) throw new Error(error.message);
  if (reservation.completed_at) return;
  const payload = reservation.payload as WorkPayload;
  const relation = reservation.agents as unknown as { endpoint_url: string | null };
  if (!relation.endpoint_url) throw new Error("Agent endpoint is not configured.");
  if (!(await canCallAgentEndpoint(relation.endpoint_url, currentTickKey))) throw new Error("Tick endpoint rate limit exceeded: this endpoint was already called during the current tick interval.");

  if (payload.kind === "acquisition") {
    const decision = await callAcquisitionDecision(relation.endpoint_url, payload.gameState);
    const { error: rpcError } = await supabase.rpc("resolve_tick_acquisition", {
      p_tick_run_id: tickRunId, p_agent_id: agentId, p_acquisition_id: payload.acquisitionId, p_decision: decision,
    });
    if (rpcError) throw new Error(rpcError.message);
    return;
  }
  if (payload.kind !== "action") throw new Error("Invalid real-agent work payload.");
  const action = await callAgent({ id: agentId, endpoint_url: relation.endpoint_url }, payload.gameState);
  const { error: rpcError } = await supabase.rpc("execute_tick_agent_action", {
    p_tick_run_id: tickRunId, p_agent_id: agentId, p_action: action,
  });
  if (rpcError) throw new Error(rpcError.message);
}

async function processNpcAgent(tickRunId: string, agentId: string) {
  const supabase = serviceClient();
  const { data: reservation, error } = await supabase.from("agent_tick_actions").select("completed_at, payload")
    .eq("tick_run_id", tickRunId).eq("agent_id", agentId).single();
  if (error) throw new Error(error.message);
  if (reservation.completed_at) return;
  const payload = reservation.payload as WorkPayload;
  if (payload.kind !== "npc") throw new Error("Invalid NPC work payload.");
  const decision = payload.decision as { action: string; amount?: number; reason: string };
  if (decision.action === "create_job" || decision.action === "struggle") {
    const { error: rpcError } = await supabase.rpc("execute_tick_npc_special", {
      p_tick_run_id: tickRunId, p_agent_id: agentId, p_action: decision.action,
      p_reason: decision.reason, p_amount: decision.amount ?? null,
    });
    if (rpcError) throw new Error(rpcError.message);
  } else {
    const { error: rpcError } = await supabase.rpc("execute_tick_npc_action", {
      p_tick_run_id: tickRunId, p_agent_id: agentId, p_action: decision as AgentActionResponse,
    });
    if (rpcError) throw new Error(rpcError.message);
  }
}

async function advancePhase(tickRunId: string, expected: string, next: string) {
  const { data, error } = await serviceClient().rpc("advance_tick_phase", {
    p_tick_run_id: tickRunId, p_expected_phase: expected, p_next_phase: next,
  });
  if (error) throw new Error(error.message);
  return data === true;
}

async function finalizeTick(tickRunId: string, currentTickKey: string) {
  const supabase = serviceClient();
  const { error: snapshotError } = await supabase.rpc("capture_company_valuations", { p_captured_at: currentTickKey });
  if (snapshotError) reportTickFailure(snapshotError, { tickKey: currentTickKey, phase: "valuation_snapshot", message: snapshotError.message });
  const { data: summary, error } = await supabase.rpc("finalize_inngest_tick", {
    p_tick_run_id: tickRunId,
    p_tick_key: currentTickKey,
    p_snapshot_error: snapshotError?.message ?? null,
  });
  if (error) throw new Error(error.message);
  console.log("Blackstone tick completed", summary);
  return summary;
}

async function recordExhaustedFailure(
  failureEvent: { data: { event: { data?: Record<string, unknown> } } },
  error: Error,
  phase: string,
) {
  const original = failureEvent.data.event.data ?? {};
  const currentTickKey = typeof original.tickKey === "string" ? original.tickKey : "unknown";
  const tickRunId = typeof original.tickRunId === "string" ? original.tickRunId : null;
  const message = error.message || "Inngest tick function exhausted all retries.";
  reportTickFailure(error, { tickKey: currentTickKey, phase, message });
  const supabase = serviceClient();
  let query = supabase.from("tick_runs").update({
    status: "failed", phase: "failed", completed_at: new Date().toISOString(),
    errors: [{ phase, message }],
  }).eq("status", "running");
  query = tickRunId ? query.eq("id", tickRunId) : query.eq("tick_key", currentTickKey);
  const { error: updateError } = await query;
  if (updateError) reportTickFailure(updateError, { tickKey: currentTickKey, phase: "mark_tick_failed", message: updateError.message });
  const { error: logError } = await supabase.from("system_logs").insert({
    level: "error", message: "Tick failed.", metadata: { tickKey: currentTickKey, phase, message, tickRunId },
  });
  if (logError) reportTickFailure(logError, { tickKey: currentTickKey, phase: "write_failure_log", message: logError.message });
}

export const coordinateTick = inngest.createFunction(
  {
    id: "coordinate-tick", retries: 3, triggers: [{ event: "blackstone/tick.requested" }],
    onFailure: ({ event, error }) => recordExhaustedFailure(event, error, "coordinator"),
  },
  async ({ event, step }) => {
    const currentTickKey = String(event.data.tickKey);
    const prepared = await step.run("reserve-real-agents", () => reserveRealAgents(currentTickKey));
    if (prepared.skipped || !prepared.tickRunId) return { skipped: true, reason: "Tick already started." };
    const events = batchEvents("real", prepared.tickRunId, currentTickKey, prepared.agentIds);
    if (events.length) {
      await step.sendEvent("fan-out-real-agent-batches", events);
      return { ok: true, tickRunId: prepared.tickRunId, batches: events.length };
    }
    const moved = await step.run("advance-empty-real-stage", () => advancePhase(prepared.tickRunId!, "real_agents", "npc_agents"));
    if (!moved) return { ok: true, tickRunId: prepared.tickRunId };
    const npcIds = await step.run("reserve-npc-agents", () => reserveNpcAgents(prepared.tickRunId!));
    const npcEvents = batchEvents("npc", prepared.tickRunId, currentTickKey, npcIds);
    if (npcEvents.length) await step.sendEvent("fan-out-npc-batches", npcEvents);
    else if (await step.run("advance-empty-npc-stage", () => advancePhase(prepared.tickRunId!, "npc_agents", "finalizing"))) {
      await step.run("finalize-empty-tick", () => finalizeTick(prepared.tickRunId!, currentTickKey));
    }
    return { ok: true, tickRunId: prepared.tickRunId };
  },
);

export const processRealBatch = inngest.createFunction(
  {
    id: "process-real-agent-batch", concurrency: 5, retries: 3, triggers: [{ event: "blackstone/tick.real-batch" }],
    onFailure: ({ event, error }) => recordExhaustedFailure(event, error, "real_batch"),
  },
  async ({ event, step }) => {
    const { tickRunId, tickKey: currentTickKey, agentIds } = event.data as { tickRunId: string; tickKey: string; agentIds: string[] };
    await step.run("process-real-agent-batch", () => Promise.all(agentIds.map(async (agentId) => {
      try { await processRealAgent(tickRunId, currentTickKey, agentId); }
      catch (error) {
        const message = error instanceof Error ? error.message : "Unknown action error";
        reportTickFailure(error, { tickKey: currentTickKey, agentId, phase: "action", message });
        await markFailed(tickRunId, agentId, "unknown", message);
      }
    })));
    const moved = await step.run("advance-real-stage-if-complete", () => advancePhase(tickRunId, "real_agents", "npc_agents"));
    if (!moved) return { ok: true };
    const npcIds = await step.run("reserve-npc-agents", () => reserveNpcAgents(tickRunId));
    const events = batchEvents("npc", tickRunId, currentTickKey, npcIds);
    if (events.length) await step.sendEvent("fan-out-npc-batches", events);
    else if (await step.run("advance-empty-npc-stage", () => advancePhase(tickRunId, "npc_agents", "finalizing"))) {
      await step.run("finalize-tick", () => finalizeTick(tickRunId, currentTickKey));
    }
    return { ok: true, npcBatches: events.length };
  },
);

export const processNpcBatch = inngest.createFunction(
  {
    id: "process-npc-agent-batch", concurrency: 5, retries: 3, triggers: [{ event: "blackstone/tick.npc-batch" }],
    onFailure: ({ event, error }) => recordExhaustedFailure(event, error, "npc_batch"),
  },
  async ({ event, step }) => {
    const { tickRunId, tickKey: currentTickKey, agentIds } = event.data as { tickRunId: string; tickKey: string; agentIds: string[] };
    await step.run("process-npc-agent-batch", () => Promise.all(agentIds.map(async (agentId) => {
      try { await processNpcAgent(tickRunId, agentId); }
      catch (error) {
        const message = error instanceof Error ? error.message : "Unknown NPC error";
        reportTickFailure(error, { tickKey: currentTickKey, agentId, phase: "npc", message });
        await markFailed(tickRunId, agentId, "unknown", message);
      }
    })));
    const moved = await step.run("advance-npc-stage-if-complete", () => advancePhase(tickRunId, "npc_agents", "finalizing"));
    if (moved) await step.run("finalize-tick", () => finalizeTick(tickRunId, currentTickKey));
    return { ok: true };
  },
);

export const tickFunctions = [coordinateTick, processRealBatch, processNpcBatch];
