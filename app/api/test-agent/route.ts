import { callAgentDetailed } from "@/lib/call-agent";
import { executeAgentAction } from "@/lib/execute-agent-action";
import { NextResponse } from "next/server";
import { isModerationAdmin } from "@/lib/moderation-admin";
import { testAgentRequestSchema, zodErrorMessage } from "@/lib/validation";

export async function POST(request: Request) {
  if (!isModerationAdmin()) {
    return NextResponse.json({ error: "Admin authentication is required." }, { status: 401 });
  }
  let input: unknown;

  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = testAgentRequestSchema.safeParse(input);
  if (!parsed.success) {
    return NextResponse.json({ error: zodErrorMessage(parsed.error) }, { status: 400 });
  }

  const endpointUrl = parsed.data.endpoint_url.trim();
  const agentId = parsed.data.execute === true ? parsed.data.agent_id?.trim() : undefined;
  const result = await callAgentDetailed(
    { endpoint_url: endpointUrl, id: agentId },
    parsed.data.gameState,
  );

  if (parsed.data.execute === true && agentId) {
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
