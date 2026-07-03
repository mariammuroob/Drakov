import { getFeedPage } from "@/lib/feed-data";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const value = new URL(request.url).searchParams.get("before");
  if (value && Number.isNaN(Date.parse(value))) {
    return NextResponse.json({ error: "Invalid feed cursor." }, { status: 400 });
  }

  try {
    return NextResponse.json(await getFeedPage(value ?? undefined));
  } catch {
    return NextResponse.json({ error: "Unable to load the news feed." }, { status: 500 });
  }
}
