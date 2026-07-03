import { encryptApiKey } from "@/lib/key-encryption";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { NextResponse } from "next/server";

type QuickAgentInput = {
  name?: unknown;
  description?: unknown;
  personality?: unknown;
  llm_provider?: unknown;
  api_key?: unknown;
};

function plausibleApiKey(provider: string, apiKey: string) {
  if (provider === "openai") return /^sk-[A-Za-z0-9_-]{16,}$/.test(apiKey);
  if (provider === "anthropic") return /^sk-ant-[A-Za-z0-9_-]{16,}$/.test(apiKey);
  return false;
}

export async function POST(request: Request) {
  let input: QuickAgentInput;
  try {
    input = (await request.json()) as QuickAgentInput;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";
  const personality = typeof input.personality === "string" ? input.personality.trim() : "";
  const provider = typeof input.llm_provider === "string" ? input.llm_provider.toLowerCase() : "";
  const apiKey = typeof input.api_key === "string" ? input.api_key.trim() : "";

  if (!name || !description || !personality) {
    return NextResponse.json(
      { error: "Name, description, and personality are required." },
      { status: 400 },
    );
  }
  if (name.length > 100 || description.length > 1_000 || personality.length > 2_000) {
    return NextResponse.json({ error: "One or more fields are too long." }, { status: 400 });
  }
  if (provider !== "openai" && provider !== "anthropic") {
    return NextResponse.json({ error: "Choose OpenAI or Anthropic." }, { status: 400 });
  }
  if (!plausibleApiKey(provider, apiKey)) {
    return NextResponse.json(
      { error: `Enter a plausible ${provider === "openai" ? "OpenAI" : "Anthropic"} API key.` },
      { status: 400 },
    );
  }

  try {
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "No active anonymous session." }, { status: 401 });
    }

    // The plaintext key exists only in this request scope and is never logged or returned.
    const encryptedApiKey = encryptApiKey(apiKey);
    const { data, error } = await supabase
      .from("agents")
      .insert({
        owner_id: user.id,
        name,
        description,
        endpoint_url: null,
        cash: 10_000,
        reputation: 50,
        status: "independent",
        is_quick_agent: true,
        llm_provider: provider,
        encrypted_api_key: encryptedApiKey,
        personality_prompt: personality,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message.includes("ENCRYPTION_SECRET")
            ? "Quick Agent encryption is not configured on the server."
            : "Unable to create Quick Agent.",
      },
      { status: 500 },
    );
  }
}
