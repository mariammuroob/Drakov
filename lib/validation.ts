import { z } from "zod";

const uuidSchema = z.string().uuid();
const httpUrlSchema = z.string().trim().max(2048).url().refine((value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}, "Must be a valid HTTP or HTTPS URL.");

const SCRIPT_ELEMENT_PATTERN = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
const SCRIPT_TAG_PATTERN = /<\/?script\b[^>]*>/gi;

export function sanitizePublicText(value: string) {
  return value
    .replace(SCRIPT_ELEMENT_PATTERN, "")
    .replace(SCRIPT_TAG_PATTERN, "")
    .trim();
}

function publicText(maxLength: number, requiredMessage = "Required.") {
  return z.string()
    .transform(sanitizePublicText)
    .pipe(z.string().min(1, requiredMessage).max(maxLength));
}

const reasonText = publicText(1000, "Reason is required.");
const positiveNumber = z.number().finite().positive();

export const createCompanyActionSchema = z.object({
  action: z.literal("create_company"),
  reason: reasonText,
  name: publicText(100, "Company name is required."),
  market: publicText(100, "Market is required."),
}).passthrough();

export const applyJobActionSchema = z.object({
  action: z.literal("apply_job"),
  reason: reasonText,
  job_id: uuidSchema,
}).passthrough();

export const investActionSchema = z.object({
  action: z.literal("invest"),
  reason: reasonText,
  company_id: uuidSchema,
  amount: positiveNumber,
}).passthrough();

export const partnerActionSchema = z.object({
  action: z.literal("partner"),
  reason: reasonText,
  company_a_id: uuidSchema,
  company_b_id: uuidSchema,
}).passthrough();

export const acquireActionSchema = z.object({
  action: z.literal("acquire"),
  reason: reasonText,
  acquirer_company_id: uuidSchema,
  target_company_id: uuidSchema,
  offer_amount: positiveNumber,
}).passthrough();

export const quitActionSchema = z.object({
  action: z.literal("quit"),
  reason: reasonText,
}).passthrough();

export const saveCashActionSchema = z.object({
  action: z.literal("save_cash"),
  reason: reasonText,
}).passthrough();

export const postActionSchema = z.object({
  action: z.literal("post"),
  reason: reasonText,
  message: publicText(2000, "Post message is required."),
}).passthrough();

export const agentActionResponseSchema = z.discriminatedUnion("action", [
  createCompanyActionSchema,
  applyJobActionSchema,
  investActionSchema,
  partnerActionSchema,
  acquireActionSchema,
  quitActionSchema,
  saveCashActionSchema,
  postActionSchema,
]);

export const agentRegistrationSchema = z.object({
  name: publicText(100, "Name is required."),
  description: publicText(1000, "Description is required."),
  endpoint_url: httpUrlSchema,
});

export const magicLinkRequestSchema = z.object({
  email: z.string().trim().max(320).email("Enter a valid email address."),
  next: z.union([z.literal("/launch"), z.literal("/my-agents")]).optional(),
});

export const testAgentRequestSchema = z.object({
  endpoint_url: httpUrlSchema,
  gameState: z.unknown(),
  agent_id: z.string().trim().optional(),
  execute: z.boolean().optional(),
}).superRefine((value, ctx) => {
  if (value.execute === true && (!value.agent_id || value.agent_id.trim().length === 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Agent ID is required to execute an action.",
      path: ["agent_id"],
    });
  }
});

export const jsonObjectBodySchema = z.record(z.string(), z.unknown());

export type AgentActionResponseSchema = z.infer<typeof agentActionResponseSchema>;

function formatPath(path: PropertyKey[]) {
  if (!path.length) return "request body";
  return path.map((segment) => {
    if (typeof segment === "number") return `[${segment}]`;
    if (typeof segment === "symbol") return segment.description ?? "symbol";
    return segment;
  }).join(".");
}

export function zodErrorMessage(error: z.ZodError) {
  const issue = error.issues[0];
  if (!issue) return "Invalid request body.";
  const path = formatPath(issue.path);
  return `${path}: ${issue.message}`;
}
