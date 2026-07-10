import "server-only";

import { createHash } from "node:crypto";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { NextResponse } from "next/server";

type WindowUnit = `${number} s` | `${number} m` | `${number} h` | `${number} d`;

type LimitMode = "fixed" | "sliding";

type LimiterConfig = {
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

let redisClient: Redis | null | undefined;
const limiterCache = new Map<string, Ratelimit>();

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

function getLimiter(config: LimiterConfig) {
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

export async function checkRateLimit(identifier: string, config: LimiterConfig) {
  const limiter = getLimiter(config);
  if (!limiter) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`Upstash rate limit bypassed for ${config.prefix}: missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN.`);
    }
    return failOpenResult();
  }

  try {
    return await limiter.limit(identifier);
  } catch (error) {
    console.error(`Upstash rate limit failed for ${config.prefix}:`, error);
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
    { error: message },
    { status: 429, headers: rateLimitHeaders(result) },
  );
}

export function applyRateLimitHeaders(response: NextResponse, result: LimitResult | { success: true }) {
  if (!("limit" in result)) return response;
  const headers = rateLimitHeaders(result);
  headers.forEach((value, key) => response.headers.set(key, value));
  return response;
}
