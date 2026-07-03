import "server-only";

import { AgentActionResponse, parseAgentResponse } from "@/lib/call-agent";
import type { AcquisitionDecision } from "@/lib/call-acquisition-decision";
import { decryptApiKey } from "@/lib/key-encryption";
import { createClient } from "@supabase/supabase-js";

type QuickAgent = {
  id: string;
  llm_provider: "openai" | "anthropic";
  encrypted_api_key: string;
  personality_prompt: string;
};

const ACTION_INSTRUCTIONS = `Return only one JSON object. It must contain "action" and a non-empty "reason".
Allowed actions and required extra fields:
- create_company: name, market
- apply_job: job_id
- invest: company_id, amount
- partner: company_a_id, company_b_id
- acquire: acquirer_company_id, target_company_id, offer_amount
- quit: no extra fields
- save_cash: no extra fields
- post: message
Do not wrap the JSON in markdown.`;

function jsonText(text: string) {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(withoutFence) as unknown;
}

async function providerText(
  provider: QuickAgent["llm_provider"],
  apiKey: string,
  prompt: string,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    if (provider === "openai") {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "gpt-5.4-mini", input: prompt, max_output_tokens: 800 }),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error("OpenAI request failed.");
      const body = (await response.json()) as {
        output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
      };
      const text = body.output
        ?.flatMap((item) => item.content ?? [])
        .find((item) => item.type === "output_text")?.text;
      if (!text) throw new Error("OpenAI returned no text.");
      return text;
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 800,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Anthropic request failed.");
    const body = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    const text = body.content?.find((item) => item.type === "text")?.text;
    if (!text) throw new Error("Anthropic returned no text.");
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

async function logQuickFallback(agentId: string) {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await supabase.from("events").insert({
      type: "system",
      agent_id: agentId,
      message: "Quick Agent used the safe fallback after an invalid provider response.",
      reason: "fallback - invalid agent response",
    });
  } catch {
    // A logging failure must never crash the tick or reveal provider details.
  }
}

export async function callQuickAgent(
  agent: QuickAgent,
  gameState: unknown,
): Promise<AgentActionResponse> {
  try {
    const apiKey = decryptApiKey(agent.encrypted_api_key);
    const prompt = `You are a Blackstone economic agent.

Your private personality and strategy:
${agent.personality_prompt}

${ACTION_INSTRUCTIONS}

Current game state:
${JSON.stringify(gameState)}`;
    const parsed = jsonText(await providerText(agent.llm_provider, apiKey, prompt));
    const action = parseAgentResponse(parsed);
    if (!action || !action.reason.trim()) throw new Error("Invalid action response.");
    return action;
  } catch {
    await logQuickFallback(agent.id);
    return { action: "save_cash", reason: "fallback - invalid agent response" };
  }
}

export async function callQuickAcquisitionDecision(
  agent: QuickAgent,
  gameState: unknown,
): Promise<AcquisitionDecision> {
  try {
    const apiKey = decryptApiKey(agent.encrypted_api_key);
    const prompt = `You are resolving an acquisition offer in Blackstone.

Your private personality and strategy:
${agent.personality_prompt}

Return only JSON with "decision" (accept, reject, or counter) and a non-empty "reason".
A counter decision must also include a positive numeric "counter_amount". Do not use markdown.

Current game state:
${JSON.stringify(gameState)}`;
    const value = jsonText(await providerText(agent.llm_provider, apiKey, prompt)) as Record<string, unknown>;
    if (
      value.decision !== "accept" &&
      value.decision !== "reject" &&
      value.decision !== "counter"
    ) throw new Error("Invalid decision.");
    if (typeof value.reason !== "string" || !value.reason.trim()) {
      throw new Error("Missing reason.");
    }
    if (
      value.decision === "counter" &&
      (typeof value.counter_amount !== "number" || value.counter_amount <= 0)
    ) throw new Error("Invalid counter.");
    return {
      decision: value.decision,
      reason: value.reason.trim(),
      ...(value.decision === "counter" ? { counter_amount: value.counter_amount as number } : {}),
    };
  } catch {
    return { decision: "reject", reason: "fallback - invalid acquisition decision" };
  }
}
