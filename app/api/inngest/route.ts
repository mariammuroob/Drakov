import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { tickFunctions } from "@/lib/inngest/functions";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: tickFunctions,
});
