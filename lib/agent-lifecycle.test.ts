import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ARCHIVE_AGENT_UPDATE, isAgentEligibleForTick } from "./agent-lifecycle";

const root = process.cwd();

function readProjectFile(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("agent archive lifecycle", () => {
  it("uses the existing soft-archive state for owner deactivation", () => {
    expect(ARCHIVE_AGENT_UPDATE).toEqual({
      status: "archived",
      endpoint_url: null,
      endpoint_verified: false,
      endpoint_verified_at: null,
      endpoint_status: null,
      endpoint_latency_ms: null,
    });
  });

  it("keeps archived agents ineligible for tick processing", () => {
    expect(isAgentEligibleForTick({
      status: "archived",
      cash: 10000,
      endpoint_verified: true,
    })).toBe(false);
  });

  it("keeps active verified agents eligible for tick processing", () => {
    expect(isAgentEligibleForTick({
      status: "independent",
      cash: 10000,
      endpoint_verified: true,
    })).toBe(true);
  });
});

describe("agent deletion hardening", () => {
  it("uses PATCH from the UI instead of DELETE", () => {
    const button = readProjectFile("components/deactivate-agent-button.tsx");
    expect(button).toContain('method: "PATCH"');
    expect(button).not.toContain('method: "DELETE"');
  });

  it("keeps hard-delete disabled on the agent API route", () => {
    const route = readProjectFile("app/api/agents/[id]/route.ts");
    expect(route).toContain("export async function PATCH");
    expect(route).toContain("export async function DELETE");
    expect(route).toContain("Hard deletion is disabled");
    expect(route).not.toContain(".delete()");
  });

  it("uses owner-matched update filters so another user cannot archive it", () => {
    const route = readProjectFile("app/api/agents/[id]/route.ts");
    expect(route).toContain('.eq("owner_id", user.id)');
    expect(route).toContain(".update(ARCHIVE_AGENT_UPDATE)");
    expect(route).not.toContain(".delete()");
  });

  it("adds forward-only SQL that blocks normal-user hard deletes", () => {
    const migration = readProjectFile("supabase/migrations/20260714030000_disable_agent_hard_delete.sql");
    expect(migration).toContain("revoke delete on table public.agents from anon, authenticated");
    expect(migration).toContain('drop policy if exists "Users can delete their own agents"');
    expect(migration).toContain('drop policy if exists "Durable owners can delete their own agents"');
    expect(migration).not.toMatch(/delete\s+from\s+public\.agents/i);
  });

  it("keeps owner archive permission narrow instead of granting protected columns", () => {
    const migration = readProjectFile("supabase/migrations/20260714020000_narrow_agent_deactivation_update_grant.sql");
    const grantBlock = migration.match(/grant update \(([\s\S]*?)\) on table public\.agents to authenticated/i)?.[1] ?? "";
    expect(grantBlock).toContain("endpoint_verified");
    expect(grantBlock).not.toContain("endpoint_failure_count");
    expect(grantBlock).not.toContain("cash");
    expect(grantBlock).not.toContain("owner_id");
    expect(grantBlock).not.toContain("reputation");
  });
});
