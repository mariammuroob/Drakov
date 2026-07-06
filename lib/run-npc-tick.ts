import "server-only";

import type { AgentActionResponse } from "@/lib/call-agent";
import { executeAgentAction } from "@/lib/execute-agent-action";
import { decideNpcAction, NpcArchetype } from "@/lib/npc-rules";
import { createClient } from "@supabase/supabase-js";

type NpcTickError = { agentId: string; phase: "npc"; message: string };

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function runNpcTick(tickRunId: string) {
  const supabase = client();
  const actionCounts: Record<string, number> = {};
  const errors: NpcTickError[] = [];
  let processed = 0;

  const [agentsResult, profilesResult, companiesResult] = await Promise.all([
    supabase
      .from("agents")
      .select("id, name, cash, status")
      .eq("is_npc", true)
      .neq("status", "bankrupt")
      .neq("status", "archived")
      .eq("is_flagged", false)
      .order("created_at", { ascending: true }),
    supabase.from("npc_profiles").select("agent_id, archetype, config, ticks_acted"),
    supabase.from("companies").select("id, founder_agent_id, name, cash, valuation"),
  ]);

  const queryError = [agentsResult.error, profilesResult.error, companiesResult.error].find(Boolean);
  if (queryError) throw new Error(queryError.message);

  const companies = (companiesResult.data ?? []).map((company) => ({
    ...company,
    cash: Number(company.cash),
    valuation: Number(company.valuation),
  }));
  const profiles = new Map((profilesResult.data ?? []).map((profile) => [profile.agent_id, profile]));

  for (const row of agentsResult.data ?? []) {
    const profile = profiles.get(row.id);
    if (!profile) continue;

    const { error: reservationError } = await supabase.from("agent_tick_actions").insert({
      tick_run_id: tickRunId,
      agent_id: row.id,
      action: "pending",
    });
    if (reservationError?.code === "23505") continue;
    if (reservationError) {
      errors.push({ agentId: row.id, phase: "npc", message: reservationError.message });
      continue;
    }
    processed += 1;

    let actionName = "unknown";
    let actionError: string | undefined;
    try {
      const decision = decideNpcAction(
        { ...row, cash: Number(row.cash) },
        {
          archetype: profile.archetype as NpcArchetype,
          config: profile.config as Record<string, unknown>,
          ticks_acted: profile.ticks_acted,
        },
        companies,
      );
      actionName = decision.action;

      if (decision.action === "create_job") {
        const { error } = await supabase.rpc("npc_create_job", {
          p_agent_id: row.id,
          p_reason: decision.reason,
        });
        if (error) throw new Error(error.message);
      } else if (decision.action === "struggle") {
        const { error } = await supabase.rpc("npc_apply_burn", {
          p_agent_id: row.id,
          p_amount: decision.amount,
          p_reason: decision.reason,
        });
        if (error) throw new Error(error.message);
      } else {
        await executeAgentAction(row.id, decision as AgentActionResponse);
      }

      actionCounts[actionName] = (actionCounts[actionName] ?? 0) + 1;
      await supabase
        .from("npc_profiles")
        .update({ ticks_acted: profile.ticks_acted + 1 })
        .eq("agent_id", row.id);
    } catch (error) {
      actionError = error instanceof Error ? error.message : "Unknown NPC error";
      errors.push({ agentId: row.id, phase: "npc", message: actionError });
    }

    await supabase
      .from("agent_tick_actions")
      .update({
        action: actionName,
        succeeded: !actionError,
        error: actionError ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq("tick_run_id", tickRunId)
      .eq("agent_id", row.id);
  }

  return { processed, actionCounts, errors };
}
