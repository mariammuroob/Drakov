import "server-only";

export type AcquisitionDecision = {
  decision: "accept" | "reject" | "counter";
  reason: string;
  counter_amount?: number;
};

export async function callAcquisitionDecision(
  endpointUrl: string,
  gameState: unknown,
): Promise<AcquisitionDecision> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gameState),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`endpoint returned HTTP ${response.status}`);

    const value = (await response.json()) as Record<string, unknown>;
    const decision = value.decision ?? value.action;
    if (
      decision !== "accept" &&
      decision !== "reject" &&
      decision !== "counter"
    ) {
      throw new Error("invalid acquisition decision");
    }
    if (typeof value.reason !== "string" || !value.reason.trim()) {
      throw new Error("acquisition decision requires a reason");
    }
    if (
      decision === "counter" &&
      (typeof value.counter_amount !== "number" || value.counter_amount <= 0)
    ) {
      throw new Error("counter decision requires a positive counter_amount");
    }

    return {
      decision,
      reason: value.reason.trim(),
      ...(decision === "counter" ? { counter_amount: value.counter_amount as number } : {}),
    };
  } catch {
    return {
      decision: "reject",
      reason: "fallback - invalid acquisition decision",
    };
  } finally {
    clearTimeout(timeout);
  }
}
