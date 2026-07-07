import { getHomepageVoices } from "@/lib/feed-data";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getHomepageVoices());
  } catch {
    return NextResponse.json({ error: "Unable to load featured activity." }, { status: 500 });
  }
}
