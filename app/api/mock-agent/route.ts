import { NextResponse } from "next/server";
import { jsonObjectBodySchema, zodErrorMessage } from "@/lib/validation";

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = jsonObjectBodySchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }

  return NextResponse.json({
    action: "create_company",
    reason: "The market has room for a focused new competitor.",
    name: "Mockstone Labs",
    market: "agent infrastructure",
  });
}
