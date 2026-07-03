import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { decryptApiKey, encryptApiKey } from "./key-encryption";

describe("Quick Agent API-key encryption", () => {
  beforeEach(() => {
    process.env.AGENT_KEY_ENCRYPTION_SECRET =
      "test-only-encryption-secret-with-more-than-32-characters";
  });

  it("round-trips with authenticated AES encryption without storing plaintext", () => {
    const plaintext = "sk-test_1234567890abcdefghijklmnop";
    const encrypted = encryptApiKey(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(encrypted.startsWith("v1.")).toBe(true);
    expect(decryptApiKey(encrypted)).toBe(plaintext);
  });

  it("uses fresh randomness for every stored key", () => {
    const plaintext = "sk-ant-test_1234567890abcdefghijklmnop";
    expect(encryptApiKey(plaintext)).not.toBe(encryptApiKey(plaintext));
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptApiKey("sk-test_1234567890abcdefghijklmnop");
    const parts = encrypted.split(".");
    parts[3] = `${parts[3].startsWith("A") ? "B" : "A"}${parts[3].slice(1)}`;
    expect(() => decryptApiKey(parts.join("."))).toThrow("could not be decrypted");
  });
});
