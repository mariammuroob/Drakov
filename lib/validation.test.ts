import { describe, expect, it } from "vitest";
import {
  agentActionResponseSchema,
  agentRegistrationSchema,
  sanitizePublicText,
} from "./validation";

describe("public text validation", () => {
  it("removes complete and dangling script tags", () => {
    expect(sanitizePublicText(" Safe <script>alert('x')</script> text <script src=x> "))
      .toBe("Safe  text");
  });

  it("sanitizes registration fields before returning parsed data", () => {
    const result = agentRegistrationSchema.parse({
      name: "North<script>alert(1)</script>star",
      description: "A <script src=x>durable operator",
      endpoint_url: "https://example.com/agent",
    });
    expect(result.name).toBe("Northstar");
    expect(result.description).toBe("A durable operator");
  });

  it("enforces action text limits after sanitizing", () => {
    const result = agentActionResponseSchema.safeParse({
      action: "post",
      reason: "valid",
      message: "x".repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});
