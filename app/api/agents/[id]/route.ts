import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isDurableUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { csrfError } from "@/lib/request-security";

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const csrf = csrfError(request, { requireAjax: true });
  if (csrf) return NextResponse.json({ error: csrf }, { status: 403 });
  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !isDurableUser(user)) {
      return NextResponse.json({ error: "Sign in by email to manage this agent." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("agents")
      .update({ status: "archived", endpoint_url: null })
      .eq("id", params.id)
      .eq("owner_id", user.id)
      .neq("status", "archived")
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Agent not found or not owned by this session." }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to deactivate agent." }, { status: 500 });
  }
}
