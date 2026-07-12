import { describe, expect, it } from "vitest";
import {
  ActionRejectedError,
  ActionWorldState,
  FOUNDING_COST,
  planAcquire,
  planAction,
  planApplyJob,
  planCreateCompany,
  planInvest,
  planPartner,
  planPost,
  planQuit,
  planSaveCash,
} from "./action-rules";

function world(overrides: Partial<ActionWorldState> = {}): ActionWorldState {
  return {
    agent: { id: "agent-1", name: "RexAI", cash: 10_000, status: "independent" },
    companies: [
      {
        id: "company-1",
        founder_agent_id: "agent-1",
        name: "EduForge AI",
        market: "education",
        cash: 5_000,
        valuation: 20_000,
      },
      {
        id: "company-2",
        founder_agent_id: "agent-2",
        name: "HealthBot",
        market: "health",
        cash: 4_000,
        valuation: 0,
      },
    ],
    jobs: [
      {
        id: "job-1",
        company_id: "company-2",
        title: "Researcher",
        salary: 500,
        equity_pct: 2,
        status: "open",
      },
    ],
    activeEmployment: null,
    partnershipPairs: [],
    pendingAcquisitions: [],
    ...overrides,
  };
}

describe("create_company", () => {
  it("plans the fixed founding deduction and preserves the reason", () => {
    const plan = planCreateCompany(world(), {
      reason: "Learning is ripe for reinvention.",
      name: "NewCo",
      market: "education",
    });
    expect(plan.values.foundingCost).toBe(FOUNDING_COST);
    expect(plan.event.reason).toBe("Learning is ripe for reinvention.");
  });

  it("rejects insufficient cash without declaring bankruptcy", () => {
    expect(() =>
      planCreateCompany(world({ agent: { ...world().agent, cash: 999 } }), {
        reason: "Try it.", name: "NewCo", market: "education",
      }),
    ).toThrow(ActionRejectedError);
  });
});

describe("apply_job", () => {
  it("uses salary and equity from the current job", () => {
    const plan = planApplyJob(world(), { reason: "Good fit.", job_id: "job-1" });
    expect((plan.values.job as { salary: number }).salary).toBe(500);
    expect(plan.event.message).toContain("Researcher");
  });

  it("rejects a job that is not open", () => {
    const state = world();
    state.jobs![0].status = "filled";
    expect(() => planApplyJob(state, { reason: "Apply.", job_id: "job-1" })).toThrow(
      "Job is not open.",
    );
  });
});

describe("invest", () => {
  it("computes ownership from valuation and ignores agent math", () => {
    const plan = planInvest(world(), {
      reason: "Strong upside.", company_id: "company-1", amount: 5_000, ownership_pct: 99,
    });
    expect(plan.values.ownershipPct).toBe(25);
  });

  it("handles zero valuation and rejects insufficient cash", () => {
    expect(
      planInvest(world(), { reason: "Seed it.", company_id: "company-2", amount: 100 })
        .values.ownershipPct,
    ).toBe(100);
    expect(() =>
      planInvest(world(), { reason: "Too much.", company_id: "company-1", amount: 10_001 }),
    ).toThrow("Insufficient cash");
  });
});

describe("partner", () => {
  it("allows the founder of either company", () => {
    const plan = planPartner(world(), {
      reason: "Shared distribution.", company_a_id: "company-2", company_b_id: "company-1",
    });
    expect(plan.event.message).toContain("partnered");
  });

  it("rejects an agent who founded neither company", () => {
    const state = world({ agent: { ...world().agent, id: "outsider" } });
    expect(() =>
      planPartner(state, {
        reason: "Let me in.", company_a_id: "company-1", company_b_id: "company-2",
      }),
    ).toThrow("must control");
  });
});

describe("acquire", () => {
  it("creates a pending-offer plan for a solvent founder", () => {
    const plan = planAcquire(world(), {
      reason: "Consolidate the market.",
      acquirer_company_id: "company-1",
      target_company_id: "company-2",
      offer_amount: 3_000,
    });
    expect(plan.values.offerAmount).toBe(3_000);
    expect(plan.event.type).toBe("acquisition_offered");
  });

  it("rejects an offer above acquirer cash", () => {
    expect(() =>
      planAcquire(world(), {
        reason: "Stretch.", acquirer_company_id: "company-1",
        target_company_id: "company-2", offer_amount: 5_001,
      }),
    ).toThrow("insufficient cash");
  });
});

describe("quit", () => {
  it("plans ending the active employment", () => {
    const plan = planQuit(
      world({ activeEmployment: { id: "employment-1", company_id: "company-2", role: "Researcher" } }),
      { reason: "Time for something new." },
    );
    expect(plan.values.employmentId).toBe("employment-1");
  });

  it("rejects without active employment", () => {
    expect(() => planQuit(world(), { reason: "I quit." })).toThrow("no active employment");
  });
});

describe("save_cash", () => {
  it("is a no-op plan with a reasoned event", () => {
    const plan = planSaveCash(world(), { reason: "Waiting for better odds." });
    expect(plan.values).toEqual({});
    expect(plan.event.reason).toBe("Waiting for better odds.");
  });

  it("rejects a missing reason", () => {
    expect(() => planSaveCash(world(), { reason: "" })).toThrow("reason is required");
  });
});

describe("post", () => {
  it("logs free text without economic mutations", () => {
    const plan = planPost(world(), { reason: "Share my view.", message: "Patience compounds." });
    expect(plan.values).toEqual({ post: "Patience compounds." });
    expect(plan.event.message).toBe("RexAI: Patience compounds.");
  });

  it("rejects an empty post", () => {
    expect(() => planPost(world(), { reason: "Say it.", message: " " })).toThrow(
      "message is required",
    );
  });

  it("dispatcher rejects blocked post: Post message contains prohibited or spam content", () => {
    expect(() => planAction(world(), {
      action: "post",
      reason: "Promote it.",
      message: "Click here for free money",
    })).toThrowError(new ActionRejectedError("Post message contains prohibited or spam content."));
  });
});
