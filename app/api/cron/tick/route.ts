import { callAcquisitionDecision } from "@/lib/call-acquisition-decision";
import { callAgent } from "@/lib/call-agent";
import { executeAgentAction } from "@/lib/execute-agent-action";
import { runNpcTick } from "@/lib/run-npc-tick";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Keep vercel.json's schedule in sync when changing this interval.
const TICK_INTERVAL_HOURS = 4;
const BATCH_SIZE = 50;
const ACTION_CONCURRENCY = 5;
const ACTIVE_AGENT_STATUSES = ["independent", "founder", "employed"];

type Agent = {
  id: string;
  name: string;
  endpoint_url: string | null;
  cash: number | string;
  reputation: number;
  status: string;
};

type Company = {
  id: string;
  founder_agent_id: string;
  name: string;
  market: string;
  cash: number | string;
  revenue: number | string;
  valuation: number | string;
};

type TickError = { agentId?: string; phase: string; message: string };

function reportTickFailure(error: unknown, context: TickError & { tickKey: string }) {
  const exception = error instanceof Error ? error : new Error(context.message);
  console.error("Blackstone tick step failed", context);
  Sentry.captureException(exception, {
    tags: { operation: "tick", phase: context.phase },
    extra: { tickKey: context.tickKey, agentId: context.agentId, message: context.message },
  });
}

function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function tickKey(now: Date) {
  const intervalMs = TICK_INTERVAL_HOURS * 60 * 60 * 1_000;
  return new Date(Math.floor(now.getTime() / intervalMs) * intervalMs).toISOString();
}

function hotMarket(companies: Company[]) {
  const revenue = new Map<string, number>();
  for (const company of companies) {
    revenue.set(company.market, (revenue.get(company.market) ?? 0) + Number(company.revenue));
  }
  return [...revenue.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

async function inChunks<T>(items: T[], worker: (item: T) => Promise<void>) {
  for (let index = 0; index < items.length; index += ACTION_CONCURRENCY) {
    await Promise.all(items.slice(index, index + ACTION_CONCURRENCY).map(worker));
  }
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = serviceClient();
  const now = new Date();
  const currentTickKey = tickKey(now);
  const errors: TickError[] = [];
  const actionCounts: Record<string, number> = {};
  let processed = 0;
  let phase = "create_tick_run";

  const { data: tickRun, error: tickError } = await supabase
    .from("tick_runs")
    .insert({ tick_key: currentTickKey })
    .select("id")
    .single();

  if (tickError?.code === "23505") {
    return NextResponse.json({ ok: true, skipped: true, reason: "Tick already started." });
  }
  if (tickError || !tickRun) {
    const error = new Error(tickError?.message ?? "Could not create tick run.");
    reportTickFailure(error, { tickKey: currentTickKey, phase, message: error.message });
    throw error;
  }
  const tickRunId = tickRun.id;

  try {
    phase = "load_world_state";
    const cutoff = new Date(now.getTime() - TICK_INTERVAL_HOURS * 60 * 60 * 1_000).toISOString();
    const [agentsResult, companiesResult, employmentsResult, jobsResult, acquisitionsResult] =
      await Promise.all([
        supabase
          .from("agents")
          .select("id, name, endpoint_url, cash, reputation, status")
          .eq("is_npc", false)
          .eq("is_flagged", false)
          .in("status", ACTIVE_AGENT_STATUSES)
          .order("created_at", { ascending: true })
          .limit(BATCH_SIZE),
        supabase
          .from("companies")
          .select("id, founder_agent_id, name, market, cash, revenue, valuation"),
        supabase
          .from("employments")
          .select("id, agent_id, company_id, role, salary, equity_pct, started_at")
          .is("ended_at", null),
        supabase
          .from("jobs")
          .select("id, company_id, title, salary, equity_pct")
          .eq("status", "open"),
        supabase
          .from("acquisitions")
          .select("id, acquirer_company_id, target_company_id, offer_amount, created_at")
          .eq("status", "pending")
          .lt("created_at", cutoff)
          .order("created_at", { ascending: true }),
      ]);

    const queryError = [
      agentsResult.error,
      companiesResult.error,
      employmentsResult.error,
      jobsResult.error,
      acquisitionsResult.error,
    ].find(Boolean);
    if (queryError) throw new Error(queryError.message);

    const agents = (agentsResult.data ?? []) as Agent[];
    const companies = (companiesResult.data ?? []) as Company[];
    const employments = employmentsResult.data ?? [];
    const jobs = jobsResult.data ?? [];
    const acquisitions = acquisitionsResult.data ?? [];
    const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
    const companiesById = new Map(companies.map((company) => [company.id, company]));
    const usedAgentIds = new Set<string>();
    const hottestMarket = hotMarket(companies);

    async function reserve(agentId: string) {
      const { error } = await supabase.from("agent_tick_actions").insert({
        tick_run_id: tickRunId,
        agent_id: agentId,
        action: "pending",
      });
      if (error?.code === "23505") return false;
      if (error) throw new Error(error.message);
      usedAgentIds.add(agentId);
      processed += 1;
      return true;
    }

    async function finish(agentId: string, action: string, error?: string) {
      const { error: finishError } = await supabase
        .from("agent_tick_actions")
        .update({
          action,
          succeeded: !error,
          error: error ?? null,
          completed_at: new Date().toISOString(),
        })
        .eq("tick_run_id", tickRunId)
        .eq("agent_id", agentId);
      if (finishError) throw new Error(`Could not finalize agent tick action: ${finishError.message}`);
    }

    // Acquisition decisions are actions too; each target resolves at most one offer per tick.
    for (const acquisition of acquisitions) {
      const targetCompany = companiesById.get(acquisition.target_company_id);
      const acquirerCompany = companiesById.get(acquisition.acquirer_company_id);
      const targetAgent = targetCompany ? agentsById.get(targetCompany.founder_agent_id) : undefined;
      if (!targetAgent || !targetCompany || !acquirerCompany || usedAgentIds.has(targetAgent.id)) continue;
      if (!(await reserve(targetAgent.id))) continue;

      try {
        const acquisitionState = {
          request_type: "acquisition_decision",
          agent: {
            id: targetAgent.id,
            cash: Number(targetAgent.cash),
            reputation: targetAgent.reputation,
          },
          offer: {
            acquisition_id: acquisition.id,
            acquirer: acquirerCompany,
            target: targetCompany,
            offer_amount: Number(acquisition.offer_amount),
          },
          allowed_decisions: ["accept", "reject", "counter"],
        };
        const decision = await callAcquisitionDecision(targetAgent.endpoint_url!, acquisitionState);
        const { error } = await supabase.rpc("resolve_acquisition", {
          p_acquisition_id: acquisition.id,
          p_target_agent_id: targetAgent.id,
          p_decision: decision,
        });
        if (error) throw new Error(error.message);
        const countKey = `acquisition_${decision.decision}`;
        actionCounts[countKey] = (actionCounts[countKey] ?? 0) + 1;
        await finish(targetAgent.id, countKey);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown acquisition error";
        errors.push({ agentId: targetAgent.id, phase: "acquisition", message });
        reportTickFailure(error, { tickKey: currentTickKey, agentId: targetAgent.id, phase: "acquisition", message });
        await finish(targetAgent.id, "acquisition_decision", message);
      }
    }

    await inChunks(
      agents.filter((agent) => !usedAgentIds.has(agent.id)),
      async (agent) => {
        if (!(await reserve(agent.id))) return;
        let actionName = "unknown";
        try {
          const foundedCompanies = companies.filter((company) => company.founder_agent_id === agent.id);
          const employment = employments.find((item) => item.agent_id === agent.id) ?? null;
          const gameState = {
              tick: currentTickKey,
              agent: {
                id: agent.id,
                name: agent.name,
                cash: Number(agent.cash),
                reputation: agent.reputation,
                status: agent.status,
              },
              employment,
              company: foundedCompanies[0] ?? null,
              companies: foundedCompanies,
              hot_market_sector: hottestMarket,
              available_offers: {
                jobs,
                acquisitions: acquisitions.filter((offer) =>
                  foundedCompanies.some((company) => company.id === offer.target_company_id)),
              },
            };
          const action = await callAgent(
            { id: agent.id, endpoint_url: agent.endpoint_url! },
            gameState,
          );
          actionName = action.action;
          await executeAgentAction(agent.id, action);
          actionCounts[actionName] = (actionCounts[actionName] ?? 0) + 1;
          await finish(agent.id, actionName);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown action error";
          errors.push({ agentId: agent.id, phase: "action", message });
          reportTickFailure(error, { tickKey: currentTickKey, agentId: agent.id, phase: "action", message });
          await finish(agent.id, actionName, message);
        }
      },
    );

    phase = "npc_actions";
    const npcResult = await runNpcTick(tickRunId);
    processed += npcResult.processed;
    errors.push(...npcResult.errors);
    for (const npcError of npcResult.errors) {
      reportTickFailure(new Error(npcError.message), { tickKey: currentTickKey, ...npcError });
    }
    for (const [action, count] of Object.entries(npcResult.actionCounts)) {
      actionCounts[action] = (actionCounts[action] ?? 0) + count;
    }

    phase = "valuation_snapshot";
    const { error: snapshotError } = await supabase.rpc("capture_company_valuations", {
      p_captured_at: currentTickKey,
    });
    if (snapshotError) {
      errors.push({ phase: "valuation_snapshot", message: snapshotError.message });
      reportTickFailure(snapshotError, { tickKey: currentTickKey, phase: "valuation_snapshot", message: snapshotError.message });
    }

    const summary = {
      tickKey: currentTickKey,
      batchSize: agents.length,
      processed,
      actionCounts,
      errors,
    };
    console.log("Blackstone tick completed", summary);
    phase = "finalize_tick_run";
    const { error: completionError } = await supabase.from("tick_runs").update({
      status: "completed",
      processed_count: processed,
      action_counts: actionCounts,
      errors,
      completed_at: new Date().toISOString(),
    }).eq("id", tickRunId);
    if (completionError) throw new Error(`Could not finalize tick run: ${completionError.message}`);
    phase = "write_system_log";
    const { error: logError } = await supabase.from("system_logs").insert({
      level: errors.length ? "warning" : "info",
      message: `Tick processed ${processed} agents with ${errors.length} errors.`,
      metadata: summary,
    });
    if (logError) throw new Error(`Could not write tick system log: ${logError.message}`);

    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown tick failure";
    const failure = { phase, message };
    errors.push(failure);
    reportTickFailure(error, { tickKey: currentTickKey, ...failure });
    const { error: failureUpdateError } = await supabase.from("tick_runs").update({
      status: "failed",
      processed_count: processed,
      action_counts: actionCounts,
      errors,
      completed_at: new Date().toISOString(),
    }).eq("id", tickRunId);
    if (failureUpdateError) reportTickFailure(failureUpdateError, { tickKey: currentTickKey, phase: "mark_tick_failed", message: failureUpdateError.message });
    const { error: failureLogError } = await supabase.from("system_logs").insert({
      level: "error",
      message: "Tick failed.",
      metadata: { tickKey: currentTickKey, phase, message, processed, errors },
    });
    if (failureLogError) reportTickFailure(failureLogError, { tickKey: currentTickKey, phase: "write_failure_log", message: failureLogError.message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
