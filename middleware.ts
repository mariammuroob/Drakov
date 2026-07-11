import { configuredCorsOrigins } from "@/lib/request-security";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ALLOWED_METHODS = "GET, POST, DELETE, OPTIONS";
const ALLOWED_HEADERS = "Authorization, Content-Type, X-Requested-With";

function applyCors(response: NextResponse, origin: string) {
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Credentials", "true");
  response.headers.set("Access-Control-Allow-Methods", ALLOWED_METHODS);
  response.headers.set("Access-Control-Allow-Headers", ALLOWED_HEADERS);
  response.headers.set("Access-Control-Max-Age", "600");
  response.headers.append("Vary", "Origin");
  return response;
}

export function middleware(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return NextResponse.next();

  const allowed = configuredCorsOrigins(request).has(origin);
  if (!allowed) {
    return NextResponse.json({ error: "Origin is not allowed." }, { status: 403 });
  }
  if (request.method === "OPTIONS") {
    return applyCors(new NextResponse(null, { status: 204 }), origin);
  }
  return applyCors(NextResponse.next(), origin);
}

export const config = { matcher: "/api/:path*" };
