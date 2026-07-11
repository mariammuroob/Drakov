import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";
import { csrfError } from "@/lib/request-security";

export async function POST(request: Request) {
  const csrf = csrfError(request);
  if (csrf) return NextResponse.json({ error: csrf }, { status: 403 });
  const supabase = createServerSupabaseClient();
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
