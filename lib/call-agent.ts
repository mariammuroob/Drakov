import "server-only";

import { createClient } from "@supabase/supabase-js";
import { AgentEndpointRequestError, fetchAgentEndpointJson, type SafeAgentEndpointRequestOptions } from "./agent-endpoint-verification";
import { agentActionResponseSchema, type AgentActionResponseSchema, zodErrorMessage } from "./validation";

export const ALLOWED_AGENT_ACTIONS = [
  "create_company",
  "apply_job",
  "invest",
  "partner",
  "acquire",
  "quit",
  "save_cash",
  "post",
] as const;

export type AgentAction = (typeof ALLOWED_AGENT_ACTIONS)[number];

export type AgentActionResponse = AgentActionResponseSchema;

export type CallableAgent = {
  id?: string;
  endpoint_url: string;
};

export type CallAgentDetails = {
  rawResponse: unknown;
  parsedAction: AgentActionResponse;
  usedFallback: boolean;
};

const FALLBACK_ACTION: AgentActionResponse = {
  action: "save_cash",
  reason: "fallback - invalid agent response",
};

export function parseAgentResponse(value: unknown): AgentActionResponse | null {
  const parsed = agentActionResponseSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function isUuid(value: string | undefined) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      ),
  );
}

async function logFallback(agent: CallableAgent, detail: string) {
  try {
    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRoleKey) {
      console.error(
        "Agent fallback could not be logged: SUPABASE_SERVICE_ROLE_KEY is not configured.",
      );
      return;
    }

    const supabase = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await supabase.from("events").insert({
      type: "system",
      agent_id: isUuid(agent.id) ? agent.id : null,
      company_id: null,
      message: `Agent response fallback: ${detail}`,
      reason: detail,
    });

    if (error) {
      console.error("Agent fallback event insert failed:", error.message);
    }
  } catch (error) {
    console.error("Agent fallback event insert failed:", error);
  }
}

export async function callAgentDetailed(
  agent: CallableAgent,
  gameState: unknown,
  options: SafeAgentEndpointRequestOptions = {},
): Promise<CallAgentDetails> {
  let rawResponse: unknown = null;

  try {
    const result = await fetchAgentEndpointJson(agent.endpoint_url, gameState, {
      timeoutMs: 5_000,
      ...options,
    });
    rawResponse = result.json;

    const parsedAction = agentActionResponseSchema.safeParse(rawResponse);
    if (!parsedAction.success) {
      throw new Error(`endpoint returned an invalid action response: ${zodErrorMessage(parsedAction.error)}`);
    }

    return { rawResponse, parsedAction: parsedAction.data, usedFallback: false };
  } catch (error) {
    const detail =
      error instanceof AgentEndpointRequestError && error.status === "timeout"
        ? "endpoint timed out after 5 seconds"
        : error instanceof Error
          ? error.message
          : "unknown endpoint error";

    await logFallback(agent, detail);
    return {
      rawResponse:
        rawResponse ?? { error: detail },
      parsedAction: { ...FALLBACK_ACTION },
      usedFallback: true,
    };
  }
}

export async function callAgent(
  agent: CallableAgent,
  gameState: unknown,
): Promise<AgentActionResponse> {
  const result = await callAgentDetailed(agent, gameState);
  return result.parsedAction;
}
