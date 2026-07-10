import { createServerSupabaseClient } from "@/lib/supabase-server";
import { applyRateLimitHeaders, checkRateLimit, enforceRateLimit, getRequestIp, hashIdentifier } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

type Input = { email?: unknown; next?: unknown };

function safeNext(value: unknown) {
  return value === "/my-agents" ? "/my-agents" : "/launch";
}

function serializeAuthError(error: unknown) {
  if (error === null || (typeof error !== "object" && typeof error !== "function")) {
    return JSON.stringify({ value: String(error) });
  }

  try {
    return JSON.stringify(error, Object.getOwnPropertyNames(error));
  } catch (serializationError) {
    return JSON.stringify({
      serializationError:
        serializationError instanceof Error
          ? serializationError.message
          : String(serializationError),
      errorType: Object.prototype.toString.call(error),
    });
  }
}

function authErrorMessage(error: unknown) {
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    for (const key of ["message", "error_description", "msg", "details"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim() && value.trim() !== "{}") {
        return value;
      }
    }

    const cause = record.cause;
    if (cause && typeof cause === "object") {
      const causeMessage = (cause as Record<string, unknown>).message;
      if (typeof causeMessage === "string" && causeMessage.trim()) return causeMessage;
    }

    const name = typeof record.name === "string" ? record.name : "Supabase auth error";
    const status = typeof record.status === "number" ? ` (status ${record.status})` : "";
    const code = typeof record.code === "string" ? ` [${record.code}]` : "";
    return `${name}${status}${code}: magic-link delivery failed. See the server log for full details.`;
  }

  if (typeof error === "string" && error.trim() && error.trim() !== "{}") return error;
  return "Supabase rejected the magic-link request. See the server log for full details.";
}

export async function POST(request: Request) {
  const ip = getRequestIp(request);
  const publicRouteLimit = await enforceRateLimit(
    `ip:${ip}`,
    { prefix: "api:auth:magic-link:ip", limit: 20, window: "1 h", mode: "sliding" },
    "Too many magic-link requests from this IP. Please try again later.",
  );
  if (publicRouteLimit) return publicRouteLimit;

  let input: Input;
  try {
    input = (await request.json()) as Input;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const emailLimit = await checkRateLimit(`email:${hashIdentifier(email)}`, {
    prefix: "api:auth:magic-link:email",
    limit: 5,
    window: "1 h",
  });
  if (!emailLimit.success) {
    return applyRateLimitHeaders(
      NextResponse.json({ error: "Too many magic-link requests for this email. Please try again later." }, { status: 429 }),
      emailLimit,
    );
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.is_anonymous) await supabase.auth.signOut({ scope: "local" });

    const origin = new URL(request.url).origin;
    const next = safeNext(input.next);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        shouldCreateUser: true,
      },
    });
    if (error) {
      console.error("Supabase signInWithOtp returned an error:", serializeAuthError(error));
      return NextResponse.json(
        { error: authErrorMessage(error) },
        { status: typeof error.status === "number" ? error.status : 400 },
      );
    }
    return applyRateLimitHeaders(NextResponse.json({ ok: true }), emailLimit);
  } catch (caught) {
    console.error("Supabase signInWithOtp threw an error:", serializeAuthError(caught));
    return NextResponse.json({ error: authErrorMessage(caught) }, { status: 500 });
  }
}
