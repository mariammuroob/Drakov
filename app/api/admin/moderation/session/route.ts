import { MODERATION_COOKIE, moderationAdminToken, validModerationPassword } from "@/lib/moderation-admin";
import { NextResponse } from "next/server";
import { csrfError } from "@/lib/request-security";
import { enforceRateLimit, getRequestIp } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const csrf = csrfError(request);
  if (csrf) return NextResponse.json({ error: csrf }, { status: 403 });
  const sessionLimit = await enforceRateLimit(
    `ip:${getRequestIp(request)}`,
    { prefix: "api:admin:moderation:session:ip", limit: 10, window: "1 h", mode: "sliding", failClosed: true },
    "Too many admin sign-in attempts from this IP. Please try again later.",
  );
  if (sessionLimit) return sessionLimit;
  const form = await request.formData();
  const candidate = typeof form.get("password") === "string" ? String(form.get("password")) : "";
  const next = form.get("next") === "/test-agent" ? "/test-agent" : "/admin/moderation";
  if (!validModerationPassword(candidate)) {
    const failedUrl = new URL("/admin/moderation", request.url);
    failedUrl.searchParams.set("error", "1");
    if (next === "/test-agent") failedUrl.searchParams.set("next", next);
    return NextResponse.redirect(failedUrl, { status: 303 });
  }
  const response = NextResponse.redirect(new URL(next, request.url), { status: 303 });
  response.cookies.set(MODERATION_COOKIE, moderationAdminToken(), {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/",
  });
  return response;
}
