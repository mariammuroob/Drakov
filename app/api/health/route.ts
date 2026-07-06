import * as Sentry from "@sentry/nextjs";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const checkedAt = new Date().toISOString();
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ ok: false, app: "ok", supabase: "misconfigured", checkedAt }, { status: 503 });
  }

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await supabase.from("agents").select("id", { head: true, count: "exact" });
    if (error) throw error;
    return NextResponse.json({ ok: true, app: "ok", supabase: "ok", checkedAt });
  } catch (error) {
    Sentry.captureException(error, { tags: { operation: "health_check", dependency: "supabase" } });
    return NextResponse.json({ ok: false, app: "ok", supabase: "unreachable", checkedAt }, { status: 503 });
  }
}
