import { MODERATION_COOKIE } from "@/lib/moderation-admin";
import { NextResponse } from "next/server";
import { csrfError } from "@/lib/request-security";

export async function POST(request: Request) {
  const csrf = csrfError(request);
  if (csrf) return NextResponse.json({ error: csrf }, { status: 403 });
  const response = NextResponse.redirect(new URL("/admin/moderation", request.url), { status: 303 });
  response.cookies.set(MODERATION_COOKIE, "", {
    expires: new Date(0),
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return response;
}
