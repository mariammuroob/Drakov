import { describe, expect, it } from "vitest";
import { csrfError } from "./request-security";

describe("csrfError", () => {
  it("accepts verified same-origin AJAX mutations", () => {
    const request = new Request("https://blackstone.example/api/agents", {
      method: "POST",
      headers: {
        origin: "https://blackstone.example",
        "sec-fetch-site": "same-origin",
        "x-requested-with": "XMLHttpRequest",
      },
    });
    expect(csrfError(request, { requireAjax: true })).toBeNull();
  });

  it("rejects cross-origin mutations", () => {
    const request = new Request("https://blackstone.example/api/agents", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    });
    expect(csrfError(request)).toBe("Cross-site request rejected.");
  });

  it("rejects a mutation without an origin or referer", () => {
    const request = new Request("https://blackstone.example/api/agents", { method: "POST" });
    expect(csrfError(request)).toBe("Cross-site request rejected.");
  });

  it("requires the custom header when requested", () => {
    const request = new Request("https://blackstone.example/api/agents", {
      method: "POST",
      headers: { origin: "https://blackstone.example" },
    });
    expect(csrfError(request, { requireAjax: true }))
      .toBe("Missing required request verification header.");
  });
});
