import { callAgentDetailed } from "@/lib/call-agent";
import { NextResponse } from "next/server";

type TestAgentRequest = {
  endpoint_url?: unknown;
  gameState?: unknown;
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
  let input: TestAgentRequest;

  try {
    input = (await request.json()) as TestAgentRequest;
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const endpointUrl =
    typeof input.endpoint_url === "string" ? input.endpoint_url.trim() : "";

  if (!isHttpUrl(endpointUrl)) {
    return NextResponse.json(
      { error: "Endpoint URL must be a valid HTTP or HTTPS URL." },
      { status: 400 },
    );
  }

  const result = await callAgentDetailed(
    { endpoint_url: endpointUrl },
    input.gameState,
  );

  return NextResponse.json(result);
}
