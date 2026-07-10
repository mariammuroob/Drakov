import { getFeaturedRivalry } from "@/lib/feed-data";
import { applyRateLimitHeaders, checkRateLimit, getRequestIp } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function jsonResponse(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export async function GET(request: Request) {
  const rateLimit = await checkRateLimit(`ip:${getRequestIp(request)}`, {
    prefix: "api:featured-rivalry:get",
    limit: 60,
    window: "1 m",
    mode: "sliding",
  });
  if (!rateLimit.success) {
    return applyRateLimitHeaders(
      jsonResponse({ error: "Rate limit exceeded for featured rivalry. Please try again shortly." }, { status: 429 }),
      rateLimit,
    );
  }

  try {
    return applyRateLimitHeaders(jsonResponse(await getFeaturedRivalry()), rateLimit);
  } catch {
    return applyRateLimitHeaders(jsonResponse({ error: "Unable to load featured rivalry." }, { status: 500 }), rateLimit);
  }
}
