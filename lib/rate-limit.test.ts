import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  __resetRateLimitForTests,
  __setLimiterForTests,
  checkRateLimit,
  enforceRateLimit,
  isRateLimitUnavailable,
} from "./rate-limit";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.unstubAllEnvs();
  __resetRateLimitForTests();
  vi.restoreAllMocks();
});

describe("production rate limit infrastructure failures", () => {
  it("fails open in development when Upstash is missing", async () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await checkRateLimit("ip:127.0.0.1", {
      prefix: "test:dev:fallback",
      failClosed: true,
      limit: 1,
      window: "1 h",
    });

    expect(result).toEqual({ success: true });
  });

  it("fails closed in production when Upstash configuration is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await checkRateLimit("ip:127.0.0.1", {
      prefix: "test:prod:missing",
      failClosed: true,
      limit: 1,
      window: "1 h",
    });

    expect(isRateLimitUnavailable(result)).toBe(true);
    expect(result.success).toBe(false);
    expect(log).toHaveBeenCalledWith(
      "Rate limit unavailable: Upstash environment is not configured.",
      expect.objectContaining({ prefix: "test:prod:missing", production: true }),
    );
  });

  it("fails closed in production when Upstash throws", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "redacted";
    vi.spyOn(console, "error").mockImplementation(() => {});
    __setLimiterForTests({
      async limit() {
        throw new Error("redis exploded with secret redacted");
      },
    });

    const response = await enforceRateLimit("ip:127.0.0.1", {
      prefix: "test:prod:throwing",
      failClosed: true,
      limit: 1,
      window: "1 h",
    }, "Too many requests.");

    expect(response).not.toBeNull();
    expect(response?.status).toBe(503);
    await expect(response?.json()).resolves.toEqual({
      error: "Rate limiting is temporarily unavailable. Please try again shortly.",
    });
  });

  it("does not fail closed for non-sensitive production limits", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await checkRateLimit("ip:127.0.0.1", {
      prefix: "test:prod:non-sensitive",
      limit: 1,
      window: "1 h",
    });

    expect(result).toEqual({ success: true });
  });
});
