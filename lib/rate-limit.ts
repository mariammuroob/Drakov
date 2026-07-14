import "server-only";

import { createHash } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

type WindowUnit = `${number} s` | `${number} m` | `${number} h` | `${number} d`;

type LimitMode = "fixed" | "sliding";

type LimiterConfig = {
  failClosed?: boolean;
  limit: number;
  mode?: LimitMode;
  prefix: string;
  window: WindowUnit;
};

type LimitResult = {
  limit: number;
  remaining: number;
  reset: number;
  success: boolean;
};

type RateLimitUnavailableResult = LimitResult & {
  unavailable: true;
};

type RateLimitCheckResult = LimitResult | { success: true } | RateLimitUnavailableResult;

type LimiterLike = {
  limit(identifier: string): Promise<LimitResult>;
};

let redisClient: Redis | null | undefined;
const limiterCache = new Map<string, Ratelimit>();
let limiterOverrideForTests: LimiterLike | null | undefined;

function getRedisClient() {
  if (redisClient !== undefined) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    redisClient = null;
    return redisClient;
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

function getLimiter(config: LimiterConfig): LimiterLike | null {
  if (limiterOverrideForTests !== undefined) return limiterOverrideForTests;

  const key = `${config.prefix}:${config.mode ?? "fixed"}:${config.limit}:${config.window}`;
  const existing = limiterCache.get(key);
  if (existing) return existing;

  const redis = getRedisClient();
  if (!redis) return null;

  const limiter = new Ratelimit({
    redis,
    limiter: config.mode === "sliding"
      ? Ratelimit.slidingWindow(config.limit, config.window)
      : Ratelimit.fixedWindow(config.limit, config.window),
    prefix: config.prefix,
    analytics: true,
  });
  limiterCache.set(key, limiter);
  return limiter;
}

function rateLimitHeaders(result: LimitResult) {
  const headers = new Headers();
  headers.set("X-RateLimit-Limit", String(result.limit));
  headers.set("X-RateLimit-Remaining", String(Math.max(result.remaining, 0)));
  headers.set("X-RateLimit-Reset", String(result.reset));
  if (!result.success) {
    const retryAfterSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
    headers.set("Retry-After", String(retryAfterSeconds));
  }
  return headers;
}

function failOpenResult() {
  return { success: true } as const;
}

function unavailableResult(): RateLimitUnavailableResult {
  return {
    limit: 0,
    remaining: 0,
    reset: Date.now() + 60_000,
    success: false,
    unavailable: true,
  };
}

function shouldFailClosed(config: LimiterConfig) {
  return config.failClosed === true && process.env.NODE_ENV === "production";
}

function logRateLimitInfrastructureFailure(config: LimiterConfig, reason: "missing_config" | "upstash_error") {
  const message = reason === "missing_config"
    ? "Rate limit unavailable: Upstash environment is not configured."
    : "Rate limit unavailable: Upstash request failed.";
  const level = shouldFailClosed(config) ? "error" : "warn";
  console[level](message, {
    prefix: config.prefix,
    mode: config.mode ?? "fixed",
    failClosed: config.failClosed === true,
    production: process.env.NODE_ENV === "production",
  });
}

export function isRateLimitUnavailable(result: RateLimitCheckResult): result is RateLimitUnavailableResult {
  return "unavailable" in result && result.unavailable === true;
}

export function getRequestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export function hashIdentifier(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export async function checkRateLimit(identifier: string, config: LimiterConfig): Promise<RateLimitCheckResult> {
  const limiter = getLimiter(config);
  if (!limiter) {
    logRateLimitInfrastructureFailure(config, "missing_config");
    if (shouldFailClosed(config)) return unavailableResult();
    return failOpenResult();
  }

  try {
    return await limiter.limit(identifier);
  } catch {
    logRateLimitInfrastructureFailure(config, "upstash_error");
    if (shouldFailClosed(config)) return unavailableResult();
    return failOpenResult();
  }
}

export async function enforceRateLimit(
  identifier: string,
  config: LimiterConfig,
  message: string,
) {
  const result = await checkRateLimit(identifier, config);
  if (result.success) return null;

  return NextResponse.json(
    { error: isRateLimitUnavailable(result) ? "Rate limiting is temporarily unavailable. Please try again shortly." : message },
    { status: isRateLimitUnavailable(result) ? 503 : 429, headers: rateLimitHeaders(result) },
  );
}

export function rateLimitUnavailableResponse() {
  return NextResponse.json(
    { error: "Rate limiting is temporarily unavailable. Please try again shortly." },
    { status: 503, headers: rateLimitHeaders(unavailableResult()) },
  );
}

export function applyRateLimitHeaders(response: NextResponse, result: RateLimitCheckResult) {
  if (!("limit" in result)) return response;
  const headers = rateLimitHeaders(result);
  headers.forEach((value, key) => response.headers.set(key, value));
  return response;
}

export function __resetRateLimitForTests() {
  redisClient = undefined;
  limiterCache.clear();
  limiterOverrideForTests = undefined;
}

export function __setLimiterForTests(limiter: LimiterLike | null | undefined) {
  limiterOverrideForTests = limiter;
  limiterCache.clear();
}
