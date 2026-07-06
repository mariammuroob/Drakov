import { MODERATION_COOKIE, moderationAdminToken, validModerationPassword } from "@/lib/moderation-admin";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const form = await request.formData();
  const candidate = typeof form.get("password") === "string" ? String(form.get("password")) : "";
  if (!validModerationPassword(candidate)) {
    return NextResponse.redirect(new URL("/admin/moderation?error=1", request.url), { status: 303 });
  }
  const response = NextResponse.redirect(new URL("/admin/moderation", request.url), { status: 303 });
  response.cookies.set(MODERATION_COOKIE, moderationAdminToken(), {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/",
  });
  return response;
}
