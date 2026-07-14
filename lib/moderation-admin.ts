import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

export const MODERATION_COOKIE = "drakov_moderator";

function password() {
  return process.env.ADMIN_MODERATION_PASSWORD ?? "";
}

function token() {
  const secret = password();
  return secret ? createHmac("sha256", secret).update("drakov-moderation-admin").digest("hex") : "";
}

export function validModerationPassword(candidate: string) {
  const expected = password();
  if (!expected || candidate.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(candidate), Buffer.from(expected));
}

export function isModerationAdmin() {
  const actual = cookies().get(MODERATION_COOKIE)?.value ?? "";
  const expected = token();
  if (!actual || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

export function moderationAdminToken() {
  return token();
}
