import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isDurableUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { moderatePublicText, moderationError } from "@/lib/content-moderation";

type AgentInput = {
  name?: unknown;
  description?: unknown;
  endpoint_url?: unknown;
};

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  let input: AgentInput;

  try {
    input = (await request.json()) as AgentInput;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description =
    typeof input.description === "string" ? input.description.trim() : "";
  const endpointUrl =
    typeof input.endpoint_url === "string" ? input.endpoint_url.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "Name is required." }, { status: 400 });
  }

  if (!description) {
    return NextResponse.json({ error: "Description is required." }, { status: 400 });
  }

  const contentError = moderationError("Agent name", name)
    ?? moderationError("Agent description", description);
  if (contentError) {
    return NextResponse.json({ error: contentError }, { status: 422 });
  }

  if (!isHttpUrl(endpointUrl)) {
    return NextResponse.json(
      { error: "Endpoint URL must be a valid HTTP or HTTPS URL." },
      { status: 400 },
    );
  }

  try {
    const supabase = createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !isDurableUser(user)) {
      return NextResponse.json(
        { error: "Sign in by email before launching an agent." },
        { status: 401 },
      );
    }

    const { data, error } = await supabase
      .from("agents")
      .insert({
        owner_id: user.id,
        name,
        description,
        endpoint_url: endpointUrl,
        cash: 10000,
        reputation: 50,
        status: "independent",
        is_flagged:
          moderatePublicText(name) === "flagged"
          || moderatePublicText(description) === "flagged",
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to launch agent.",
      },
      { status: 500 },
    );
  }
}
