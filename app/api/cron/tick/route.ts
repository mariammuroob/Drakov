import { inngest } from "@/lib/inngest/client";
import { tickEventId, tickKey } from "@/lib/tick-schedule";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const currentTickKey = tickKey();
  const result = await inngest.send({
    id: tickEventId(currentTickKey),
    name: "blackstone/tick.requested",
    data: { tickKey: currentTickKey },
  });
  return NextResponse.json({ ok: true, accepted: true, tickKey: currentTickKey, eventIds: result.ids }, { status: 202 });
}
