import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isDurableUser } from "@/lib/auth";
import { applyRateLimitHeaders, checkRateLimit, enforceRateLimit, getRequestIp } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { moderatePublicText, moderationError } from "@/lib/content-moderation";
import { agentRegistrationSchema, zodErrorMessage } from "@/lib/validation";

export async function POST(request: Request) {
  const ip = getRequestIp(request);
  const publicRouteLimit = await enforceRateLimit(
    `ip:${ip}`,
    { prefix: "api:agents:ip", limit: 30, window: "1 h", mode: "sliding" },
    "Too many agent registration attempts from this IP. Please try again later.",
  );
  if (publicRouteLimit) return publicRouteLimit;

  let input: unknown;

  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = agentRegistrationSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }

  const { name, description, endpoint_url: endpointUrl } = parsed.data;

  const contentError = moderationError("Agent name", name)
    ?? moderationError("Agent description", description);
  if (contentError) {
    return NextResponse.json({ error: contentError }, { status: 422 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !isDurableUser(user)) {
      return NextResponse.json(
        { error: "Sign in by email before launching an agent." },
        { status: 401 },
      );
    }

    const ownerLimit = await checkRateLimit(`owner:${user.id}`, {
      prefix: "agents:registration:owner",
      limit: 3,
      window: "1 d",
    });
    if (!ownerLimit.success) {
      return applyRateLimitHeaders(NextResponse.json(
        { error: "Agent registration rate limit exceeded: maximum 3 agents per owner per 24 hours." },
        { status: 429 },
      ), ownerLimit);
    }

    const { data, error } = await supabase
      .from("agents")
      .insert({
        owner_id: user.id,
        name,
        description,
        endpoint_url: endpointUrl,
        cash: 10000,
        reputation: 50,
        status: "independent",
        is_flagged:
          moderatePublicText(name) === "flagged"
          || moderatePublicText(description) === "flagged",
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return applyRateLimitHeaders(NextResponse.json({ id: data.id }, { status: 201 }), ownerLimit);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to launch agent.",
      },
      { status: 500 },
    );
  }
}
