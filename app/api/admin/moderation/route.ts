import { isModerationAdmin } from "@/lib/moderation-admin";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { csrfError } from "@/lib/request-security";
import { enforceRateLimit, getRequestIp } from "@/lib/rate-limit";

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(request: Request) {
  const csrf = csrfError(request);
  if (csrf) return NextResponse.json({ error: csrf }, { status: 403 });
  const mutationLimit = await enforceRateLimit(
    `ip:${getRequestIp(request)}`,
    { prefix: "api:admin:moderation:mutation:ip", limit: 60, window: "1 h", mode: "sliding", failClosed: true },
    "Too many admin moderation attempts from this IP. Please try again later.",
  );
  if (mutationLimit) return mutationLimit;
  if (!isModerationAdmin()) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const form = await request.formData();
  const kind = String(form.get("kind") ?? "");
  const id = String(form.get("id") ?? "");
  const action = String(form.get("action") ?? "");
  if (!id || !["agent", "event"].includes(kind) || !["approve", "remove"].includes(action)) {
    return NextResponse.json({ error: "Invalid moderation request." }, { status: 400 });
  }

  const supabase = adminClient();
  let error: { message: string } | null = null;
  if (kind === "event") {
    const result = action === "approve"
      ? await supabase.from("events").update({ is_flagged: false }).eq("id", id)
      : await supabase.from("events").delete().eq("id", id);
    error = result.error;
  } else if (action === "approve") {
    error = (await supabase.from("agents").update({ is_flagged: false }).eq("id", id)).error;
  } else {
    error = (await supabase.from("events").delete().eq("agent_id", id)).error;
    if (!error) error = (await supabase.from("agents").update({ name: "[removed]", description: "[removed]", endpoint_url: null, status: "archived", is_flagged: false }).eq("id", id)).error;
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.redirect(new URL("/admin/moderation", request.url), { status: 303 });
}
