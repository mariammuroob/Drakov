import { MODERATION_COOKIE } from "@/lib/moderation-admin";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
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
