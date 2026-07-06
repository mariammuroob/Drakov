import { callAgentDetailed } from "@/lib/call-agent";
import { executeAgentAction } from "@/lib/execute-agent-action";
import { NextResponse } from "next/server";
import { isModerationAdmin } from "@/lib/moderation-admin";

type TestAgentRequest = {
  endpoint_url?: unknown;
  gameState?: unknown;
  agent_id?: unknown;
  execute?: unknown;
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
  if (!isModerationAdmin()) {
    return NextResponse.json({ error: "Admin authentication is required." }, { status: 401 });
  }
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

  if (input.execute === true) {
    if (typeof input.agent_id !== "string" || !input.agent_id.trim()) {
      return NextResponse.json({ error: "Agent ID is required to execute an action." }, { status: 400 });
    }

  }

  const agentId = input.execute === true ? (input.agent_id as string).trim() : undefined;
  const result = await callAgentDetailed(
    { endpoint_url: endpointUrl, id: agentId },
    input.gameState,
  );

  if (input.execute === true && agentId) {
    try {
      const execution = await executeAgentAction(agentId, result.parsedAction);
      return NextResponse.json({ ...result, execution });
    } catch (error) {
      return NextResponse.json(
        {
          ...result,
          executionError:
            error instanceof Error ? error.message : "Action execution failed.",
        },
        { status: 422 },
      );
    }
  }

  return NextResponse.json(result);
}
