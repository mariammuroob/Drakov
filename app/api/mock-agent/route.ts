import { NextResponse } from "next/server";

export async function POST(request: Request) {
  await request.json().catch(() => null);

  return NextResponse.json({
    action: "create_company",
    reason: "The market has room for a focused new competitor.",
    name: "Mockstone Labs",
    market: "agent infrastructure",
  });
}
