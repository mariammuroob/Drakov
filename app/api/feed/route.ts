import { getFeedPage } from "@/lib/feed-data";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const value = searchParams.get("before");
  const agentA = searchParams.get("agent_a");
  const agentB = searchParams.get("agent_b");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (value && Number.isNaN(Date.parse(value))) {
    return NextResponse.json({ error: "Invalid feed cursor." }, { status: 400 });
  }
  if ((agentA || agentB) && (!agentA || !agentB || agentA === agentB || !uuid.test(agentA) || !uuid.test(agentB))) {
    return NextResponse.json({ error: "Invalid rivalry filter." }, { status: 400 });
  }

  try {
    return NextResponse.json(await getFeedPage(
      value ?? undefined,
      agentA && agentB ? { agentA, agentB } : undefined,
    ));
  } catch {
    return NextResponse.json({ error: "Unable to load the news feed." }, { status: 500 });
  }
}
