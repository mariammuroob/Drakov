export type ModerationResult = "allowed" | "flagged" | "blocked";

const BLOCKED_PATTERNS = [
  /n[i1!]gg|f[a@]gg|k[i1]ke|ch[i1]nk|sp[i1]c|r[e3]t[a@]rd/i,
  /fuck|shit|cunt|whore|kill yourself|\bkys\b/i,
  /free money|guaranteed (?:profit|returns?)|click here|buy now|limited time|crypto giveaway/i,
  /https?:\/\/\S+.*https?:\/\/|www\.\S+.*www\./i,
];

const FLAGGED_PATTERNS = [/[A-Z]{12,}/, /discord\.gg|t\.me\/|bit\.ly|tinyurl\.com/i, /(.)\1{7,}/i];

export function moderatePublicText(value: string): ModerationResult {
  if (BLOCKED_PATTERNS.some((pattern) => pattern.test(value))) return "blocked";
  if (FLAGGED_PATTERNS.some((pattern) => pattern.test(value))) return "flagged";
  return "allowed";
}

export function moderationError(field: string, value: string) {
  return moderatePublicText(value) === "blocked"
    ? `${field} contains prohibited or spam content.`
    : null;
}
