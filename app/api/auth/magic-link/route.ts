import { createServerSupabaseClient } from "@/lib/supabase-server";
import { applyRateLimitHeaders, checkRateLimit, enforceRateLimit, getRequestIp, hashIdentifier, isRateLimitUnavailable, rateLimitUnavailableResponse } from "@/lib/rate-limit";
import { magicLinkRequestSchema, zodErrorMessage } from "@/lib/validation";
import { NextResponse } from "next/server";
import { csrfError } from "@/lib/request-security";

function safeNext(value: unknown) {
  return value === "/my-agents" ? "/my-agents" : "/launch";
}

const GENERIC_EMAIL_ERROR = "We couldn't send the sign-in email. Please try again shortly.";

function redactSensitiveText(value: string) {
  return value
    .replace(/(api[_-]?key|password|passwd|token|secret|authorization|smtp[_-]?pass)(["'\s:=]+)[^"',\s}]+/gi, "$1$2[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]");
}

function safeString(value: unknown) {
  if (typeof value !== "string") return value;
  return redactSensitiveText(value).slice(0, 1000);
}

function authErrorLogPayload(error: unknown) {
  if (error === null || (typeof error !== "object" && typeof error !== "function")) {
    return { value: safeString(String(error)) };
  }

  const record = error as Record<string, unknown>;
  const cause = record.cause && typeof record.cause === "object"
    ? record.cause as Record<string, unknown>
    : null;

  return {
    type: Object.prototype.toString.call(error),
    name: safeString(record.name),
    message: safeString(record.message),
    status: typeof record.status === "number" ? record.status : undefined,
    code: safeString(record.code),
    error: safeString(record.error),
    error_description: safeString(record.error_description),
    details: safeString(record.details),
    hint: safeString(record.hint),
    cause: cause
      ? {
          name: safeString(cause.name),
          message: safeString(cause.message),
          code: safeString(cause.code),
        }
      : undefined,
  };
}

function authErrorResponse(error: unknown, fallbackStatus: number) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: GENERIC_EMAIL_ERROR }, { status: fallbackStatus });
  }
  return NextResponse.json({ error: authErrorMessage(error) }, { status: fallbackStatus });
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
  const csrf = csrfError(request, { requireAjax: true });
  if (csrf) return NextResponse.json({ error: csrf }, { status: 403 });
  const ip = getRequestIp(request);
  const publicRouteLimit = await enforceRateLimit(
    `ip:${ip}`,
    { prefix: "api:auth:magic-link:ip", limit: 20, window: "1 h", mode: "sliding", failClosed: true },
    "Too many magic-link requests from this IP. Please try again later.",
  );
  if (publicRouteLimit) return publicRouteLimit;

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = magicLinkRequestSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }
  const email = parsed.data.email.trim().toLowerCase();

  const emailLimit = await checkRateLimit(`email:${hashIdentifier(email)}`, {
    prefix: "api:auth:magic-link:email",
    failClosed: true,
    limit: 5,
    window: "1 h",
  });
  if (isRateLimitUnavailable(emailLimit)) return rateLimitUnavailableResponse();
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
    const next = safeNext(parsed.data.next);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
        shouldCreateUser: true,
      },
    });
    if (error) {
      console.error("Supabase signInWithOtp returned an error:", authErrorLogPayload(error));
      return authErrorResponse(error, typeof error.status === "number" ? error.status : 400);
    }
    return applyRateLimitHeaders(NextResponse.json({ ok: true }), emailLimit);
  } catch (caught) {
    console.error("Supabase signInWithOtp threw an error:", authErrorLogPayload(caught));
    return authErrorResponse(caught, 500);
  }
}
