import { describe, expect, it, vi } from "vitest";
import { verifyAgentEndpoint } from "./agent-endpoint-verification";

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 }];

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function validAction() {
  return { action: "save_cash", reason: "Endpoint verification succeeded." };
}

describe("verifyAgentEndpoint", () => {
  it("rejects example.com placeholders", async () => {
    const result = await verifyAgentEndpoint("https://agent.example.com/api", {
      production: true,
      lookup: publicLookup,
    });
    expect(result).toMatchObject({ ok: false, status: "placeholder_url" });
  });

  it("rejects localhost", async () => {
    const result = await verifyAgentEndpoint("https://localhost/api", {
      production: true,
      lookup: publicLookup,
    });
    expect(result).toMatchObject({ ok: false, status: "blocked_network" });
  });

  it("rejects 127.0.0.1", async () => {
    const result = await verifyAgentEndpoint("https://127.0.0.1/api", {
      production: true,
      lookup: publicLookup,
    });
    expect(result).toMatchObject({ ok: false, status: "blocked_network" });
  });

  it("rejects private IPs from DNS", async () => {
    const result = await verifyAgentEndpoint("https://agent-service.drakov.dev/api", {
      production: true,
      lookup: async () => [{ address: "10.0.0.5", family: 4 }],
    });
    expect(result).toMatchObject({ ok: false, status: "blocked_network" });
  });

  it("rejects malformed URLs", async () => {
    const result = await verifyAgentEndpoint("not a url", {
      production: true,
      lookup: publicLookup,
    });
    expect(result).toMatchObject({ ok: false, status: "invalid_url" });
  });

  it("rejects HTTP in production", async () => {
    const result = await verifyAgentEndpoint("http://agent-service.drakov.dev/api", {
      production: true,
      lookup: publicLookup,
    });
    expect(result).toMatchObject({ ok: false, status: "invalid_url" });
  });

  it("rejects unreachable endpoints", async () => {
    const result = await verifyAgentEndpoint("https://agent-service.drakov.dev/api", {
      production: true,
      lookup: publicLookup,
      fetch: vi.fn(async () => {
        throw new Error("connect failed");
      }) as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ ok: false, status: "unreachable" });
  });

  it("rejects timed out endpoints", async () => {
    const result = await verifyAgentEndpoint("https://agent-service.drakov.dev/api", {
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
    expect(result).toMatchObject({ ok: false, status: "timeout" });
  });

  it("rejects 200 responses with invalid JSON", async () => {
    const result = await verifyAgentEndpoint("https://agent-service.drakov.dev/api", {
      production: true,
      lookup: publicLookup,
      fetch: vi.fn(async () => new Response("not json", { status: 200 })) as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ ok: false, status: "invalid_response" });
  });

  it("rejects valid JSON with the wrong schema", async () => {
    const result = await verifyAgentEndpoint("https://agent-service.drakov.dev/api", {
      production: true,
      lookup: publicLookup,
      fetch: vi.fn(async () => jsonResponse({ ok: true })) as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ ok: false, status: "invalid_response" });
  });

  it("accepts a valid reachable agent endpoint", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(validAction())) as unknown as typeof fetch;
    const result = await verifyAgentEndpoint("https://agent-service.drakov.dev/api", {
      production: true,
      lookup: publicLookup,
      fetch: fetchMock,
    });
    expect(result).toMatchObject({
      ok: true,
      normalizedUrl: "https://agent-service.drakov.dev/api",
      status: "verified",
    });
  });

  it("rejects redirects to private IPs", async () => {
    const fetchMock = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "https://10.0.0.5/api" },
    })) as unknown as typeof fetch;
    const result = await verifyAgentEndpoint("https://agent-service.drakov.dev/api", {
      production: true,
      lookup: publicLookup,
      fetch: fetchMock,
    });
    expect(result).toMatchObject({ ok: false, status: "blocked_network" });
  });
});
