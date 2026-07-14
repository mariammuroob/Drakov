import "server-only";

import { z } from "zod";
import { fetchAgentEndpointJson, parseWithSchema, type SafeAgentEndpointRequestOptions } from "./agent-endpoint-verification";
import { sanitizePublicText } from "./validation";

export type AcquisitionDecision = {
  decision: "accept" | "reject" | "counter";
  reason: string;
  counter_amount?: number;
};

const acquisitionDecisionResponseSchema = z.object({
  action: z.enum(["accept", "reject", "counter"]).optional(),
  counter_amount: z.number().finite().positive().optional(),
  decision: z.enum(["accept", "reject", "counter"]).optional(),
  reason: z.string().max(1000),
}).passthrough().superRefine((value, ctx) => {
  const decision = value.decision ?? value.action;
  if (!decision) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "decision or action is required",
      path: ["decision"],
    });
  }
  if (decision === "counter" && typeof value.counter_amount !== "number") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "counter decision requires a positive counter_amount",
      path: ["counter_amount"],
    });
  }
});

export async function callAcquisitionDecision(
  endpointUrl: string,
  gameState: unknown,
  options: SafeAgentEndpointRequestOptions = {},
): Promise<AcquisitionDecision> {
  try {
    const response = await fetchAgentEndpointJson(endpointUrl, gameState, {
      timeoutMs: 5_000,
      ...options,
    });
    const value = parseWithSchema(acquisitionDecisionResponseSchema, response.json, "invalid acquisition decision");
    const decision = value.decision ?? value.action;
    const reason = sanitizePublicText(value.reason);
    if (!reason || reason.length > 1000) {
      throw new Error("acquisition decision requires a reason");
    }

    return {
      decision: decision!,
      reason,
      ...(decision === "counter" ? { counter_amount: value.counter_amount as number } : {}),
    };
  } catch {
    return {
      decision: "reject",
      reason: "fallback - invalid acquisition decision",
    };
  }
}
