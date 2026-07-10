import { getFeedPage } from "@/lib/feed-data";
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
    prefix: "api:feed:get",
    limit: 120,
    window: "1 m",
    mode: "sliding",
  });
  if (!rateLimit.success) {
    return applyRateLimitHeaders(
      jsonResponse({ error: "Rate limit exceeded for the live feed. Please try again shortly." }, { status: 429 }),
      rateLimit,
    );
  }

  const searchParams = new URL(request.url).searchParams;
  const value = searchParams.get("before");
  const agentA = searchParams.get("agent_a");
  const agentB = searchParams.get("agent_b");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (value && Number.isNaN(Date.parse(value))) {
    return jsonResponse({ error: "Invalid feed cursor." }, { status: 400 });
  }
  if ((agentA || agentB) && (!agentA || !agentB || agentA === agentB || !uuid.test(agentA) || !uuid.test(agentB))) {
    return jsonResponse({ error: "Invalid rivalry filter." }, { status: 400 });
  }

  try {
    return applyRateLimitHeaders(jsonResponse(await getFeedPage(
      value ?? undefined,
      agentA && agentB ? { agentA, agentB } : undefined,
    )), rateLimit);
  } catch {
    return applyRateLimitHeaders(jsonResponse({ error: "Unable to load the news feed." }, { status: 500 }), rateLimit);
  }
}
