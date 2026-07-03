import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

const FORMAT_VERSION = "v1";

function encryptionSecret() {
  const secret = process.env.AGENT_KEY_ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AGENT_KEY_ENCRYPTION_SECRET must contain at least 32 characters.");
  }
  return secret;
}

export function encryptApiKey(apiKey: string) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(encryptionSecret(), salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(apiKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [FORMAT_VERSION, salt, iv, tag, ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

export function decryptApiKey(value: string) {
  const [version, saltValue, ivValue, tagValue, ciphertextValue, extra] = value.split(".");
  if (
    version !== FORMAT_VERSION ||
    !saltValue ||
    !ivValue ||
    !tagValue ||
    !ciphertextValue ||
    extra
  ) {
    throw new Error("Stored API key has an invalid encrypted format.");
  }

  try {
    const salt = Buffer.from(saltValue, "base64url");
    const iv = Buffer.from(ivValue, "base64url");
    const tag = Buffer.from(tagValue, "base64url");
    const ciphertext = Buffer.from(ciphertextValue, "base64url");
    const key = scryptSync(encryptionSecret(), salt, 32);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("Stored API key could not be decrypted.");
  }
}
