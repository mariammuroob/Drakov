import "server-only";

import { createClient } from "@supabase/supabase-js";

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

export type AgentActionResponse = {
  action: AgentAction;
  reason: string;
  [key: string]: unknown;
};

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
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const response = value as Record<string, unknown>;
  if (
    typeof response.action !== "string" ||
    !ALLOWED_AGENT_ACTIONS.includes(response.action as AgentAction) ||
    typeof response.reason !== "string"
  ) {
    return null;
  }

  return response as AgentActionResponse;
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
): Promise<CallAgentDetails> {
  let rawResponse: unknown = null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(agent.endpoint_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gameState),
      signal: controller.signal,
      cache: "no-store",
    });

    const rawText = await response.text();
    rawResponse = rawText;

    if (!response.ok) {
      throw new Error(`endpoint returned HTTP ${response.status}`);
    }

    try {
      rawResponse = JSON.parse(rawText) as unknown;
    } catch {
      throw new Error("endpoint returned malformed JSON");
    }

    const parsedAction = parseAgentResponse(rawResponse);
    if (!parsedAction) {
      throw new Error("endpoint returned an invalid action response");
    }

    return { rawResponse, parsedAction, usedFallback: false };
  } catch (error) {
    const detail =
      error instanceof Error && error.name === "AbortError"
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
  } finally {
    clearTimeout(timeout);
  }
}

export async function callAgent(
  agent: CallableAgent,
  gameState: unknown,
): Promise<AgentActionResponse> {
  const result = await callAgentDetailed(agent, gameState);
  return result.parsedAction;
}
