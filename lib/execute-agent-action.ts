import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  ActionRejectedError,
  ActionWorldState,
  planAction,
} from "@/lib/action-rules";
import type { AgentActionResponse } from "@/lib/call-agent";

function serviceClient() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.");
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function numberValue(value: unknown) {
  return typeof value === "number" ? value : Number(value);
}

export async function executeAgentAction(
  agentId: string,
  action: AgentActionResponse,
) {
  const supabase = serviceClient();
  const [agentResult, companiesResult, jobsResult, employmentResult, partnershipsResult, acquisitionsResult] =
    await Promise.all([
      supabase.from("agents").select("id, name, cash, status").eq("id", agentId).maybeSingle(),
      supabase
        .from("companies")
        .select("id, founder_agent_id, name, market, cash, valuation"),
      supabase.from("jobs").select("id, company_id, title, salary, equity_pct, status"),
      supabase
        .from("employments")
        .select("id, company_id, role")
        .eq("agent_id", agentId)
        .is("ended_at", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("partnerships").select("company_a_id, company_b_id"),
      supabase
        .from("acquisitions")
        .select("acquirer_company_id, target_company_id")
        .eq("status", "pending"),
    ]);

  const firstError = [
    agentResult.error,
    companiesResult.error,
    jobsResult.error,
    employmentResult.error,
    partnershipsResult.error,
    acquisitionsResult.error,
  ].find(Boolean);
  if (firstError) throw new Error(firstError.message);
  if (!agentResult.data) throw new ActionRejectedError("Agent does not exist.");

  const state: ActionWorldState = {
    agent: {
      ...agentResult.data,
      cash: numberValue(agentResult.data.cash),
    },
    companies: (companiesResult.data ?? []).map((company) => ({
      ...company,
      cash: numberValue(company.cash),
      valuation: numberValue(company.valuation),
    })),
    jobs: (jobsResult.data ?? []).map((job) => ({
      ...job,
      salary: numberValue(job.salary),
      equity_pct: numberValue(job.equity_pct),
    })),
    activeEmployment: employmentResult.data,
    partnershipPairs: (partnershipsResult.data ?? []).map((partnership) => [
      partnership.company_a_id,
      partnership.company_b_id,
    ]),
    pendingAcquisitions: (acquisitionsResult.data ?? []).map((acquisition) => [
      acquisition.acquirer_company_id,
      acquisition.target_company_id,
    ]),
  };

  const plan = planAction(state, action);
  const { data, error } = await supabase.rpc("execute_agent_action", {
    p_agent_id: agentId,
    p_action: action,
  });

  if (error) throw new ActionRejectedError(error.message);
  return { plan, result: data };
}
