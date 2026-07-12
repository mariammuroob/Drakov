import { describe, expect, it } from "vitest";
import { tickEventId, tickKey } from "./tick-schedule";

describe("tickKey", () => {
  it("uses stable four-hour UTC windows", () => {
    expect(tickKey(new Date("2026-07-13T07:59:59.999Z"))).toBe("2026-07-13T04:00:00.000Z");
    expect(tickKey(new Date("2026-07-13T08:00:00.000Z"))).toBe("2026-07-13T08:00:00.000Z");
  });

  it("returns the same key throughout a window", () => {
    expect(tickKey(new Date("2026-07-13T09:00:00.000Z")))
      .toBe(tickKey(new Date("2026-07-13T11:59:59.999Z")));
  });
});

describe("tickEventId", () => {
  it("uses the deterministic Inngest tick event id format", () => {
    expect(tickEventId("2026-07-12T12:00:00.000Z")).toBe("blackstone-tick:2026-07-12T12:00:00.000Z");
  });
});
