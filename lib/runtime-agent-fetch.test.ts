import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { callAcquisitionDecision } from "./call-acquisition-decision";
import { callAgentDetailed } from "./call-agent";

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function validAction() {
  return { action: "save_cash", reason: "Holding cash until the next window." };
}

describe("runtime agent endpoint fetch hardening", () => {
  it("rejects DNS rebinding to private resolution before calling the endpoint", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(validAction())) as unknown as typeof fetch;
    const result = await callAgentDetailed({ endpoint_url: "https://agent-service.drakov.dev/api" }, {}, {
      production: true,
      lookup: async () => [{ address: "10.0.0.8", family: 4 }],
      fetch: fetchMock,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.usedFallback).toBe(true);
    expect(result.parsedAction.action).toBe("save_cash");
    expect(result.rawResponse).toMatchObject({ error: "Private or local network URLs are not allowed." });
  });

  it("rejects redirects to localhost or private IPs", async () => {
    const fetchMock = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "https://127.0.0.1/api" },
    })) as unknown as typeof fetch;

    const result = await callAgentDetailed({ endpoint_url: "https://agent-service.drakov.dev/api" }, {}, {
      production: true,
      lookup: publicLookup,
      fetch: fetchMock,
    });

    expect(result.usedFallback).toBe(true);
    expect(result.rawResponse).toMatchObject({ error: "Private or local network URLs are not allowed." });
  });

  it("rejects oversized responses", async () => {
    const fetchMock = vi.fn(async () => new Response("x".repeat(33 * 1024), { status: 200 })) as unknown as typeof fetch;

    const result = await callAgentDetailed({ endpoint_url: "https://agent-service.drakov.dev/api" }, {}, {
      production: true,
      lookup: publicLookup,
      fetch: fetchMock,
    });

    expect(result.usedFallback).toBe(true);
    expect(result.rawResponse).toMatchObject({ error: "endpoint returned malformed JSON" });
  });

  it("rejects timed out endpoints", async () => {
    const result = await callAgentDetailed({ endpoint_url: "https://agent-service.drakov.dev/api" }, {}, {
      production: true,
      timeoutMs: 1,
      lookup: publicLookup,
      fetch: vi.fn((_url, init) => new Promise((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      })) as unknown as typeof fetch,
    });

    expect(result.usedFallback).toBe(true);
    expect(result.rawResponse).toMatchObject({ error: "endpoint timed out after 5 seconds" });
  });

  it("rejects invalid JSON", async () => {
    const result = await callAgentDetailed({ endpoint_url: "https://agent-service.drakov.dev/api" }, {}, {
      production: true,
      lookup: publicLookup,
      fetch: vi.fn(async () => new Response("not json", { status: 200 })) as unknown as typeof fetch,
    });

    expect(result.usedFallback).toBe(true);
    expect(result.rawResponse).toMatchObject({ error: "endpoint returned malformed JSON" });
  });

  it("accepts a valid public endpoint response", async () => {
    const result = await callAgentDetailed({ endpoint_url: "https://agent-service.drakov.dev/api" }, {}, {
      production: true,
      lookup: publicLookup,
      fetch: vi.fn(async () => jsonResponse(validAction())) as unknown as typeof fetch,
    });

    expect(result.usedFallback).toBe(false);
    expect(result.parsedAction).toEqual(validAction());
  });

  it("applies the same safe fetch path to acquisition decisions", async () => {
    const decision = await callAcquisitionDecision("https://agent-service.drakov.dev/api", {}, {
      production: true,
      lookup: publicLookup,
      fetch: vi.fn(async () => jsonResponse({ decision: "accept", reason: "The offer clears our risk." })) as unknown as typeof fetch,
    });

    expect(decision).toEqual({ decision: "accept", reason: "The offer clears our risk." });
  });

  it("falls back for acquisition redirects to private networks", async () => {
    const decision = await callAcquisitionDecision("https://agent-service.drakov.dev/api", {}, {
      production: true,
      lookup: publicLookup,
      fetch: vi.fn(async () => new Response(null, {
        status: 302,
        headers: { location: "http://localhost:3000/api" },
      })) as unknown as typeof fetch,
    });

    expect(decision).toEqual({
      decision: "reject",
      reason: "fallback - invalid acquisition decision",
    });
  });
});
