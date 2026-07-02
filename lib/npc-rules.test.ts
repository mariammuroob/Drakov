import { describe, expect, it } from "vitest";
import { decideNpcAction, NpcAgent, NpcCompany, NpcProfile } from "./npc-rules";

const agent: NpcAgent = { id: "npc-1", name: "Vega", cash: 10_000, status: "independent" };
const companies: NpcCompany[] = [
  { id: "low", founder_agent_id: "other", name: "LowCo", cash: 500, valuation: 1_000 },
  { id: "high", founder_agent_id: "other", name: "HighCo", cash: 5_000, valuation: 20_000 },
];

function profile(archetype: NpcProfile["archetype"], config = {}, ticks_acted = 0): NpcProfile {
  return { archetype, config, ticks_acted };
}

describe("NPC rule engine", () => {
  it("aggressive investors target the highest valuation with a fixed cash percentage", () => {
    const decision = decideNpcAction(
      agent,
      profile("aggressive_investor", { investment_pct: 0.2 }),
      companies,
    );
    expect(decision).toMatchObject({ action: "invest", company_id: "high", amount: 2_000 });
  });

  it("aggressive investors save when no company exists", () => {
    expect(decideNpcAction(agent, profile("aggressive_investor"), []).action).toBe("save_cash");
  });

  it("cautious founders create exactly when they have no company", () => {
    const decision = decideNpcAction(
      agent,
      profile("cautious_founder", { market: "education" }),
      companies,
    );
    expect(decision).toMatchObject({ action: "create_company", market: "education" });
  });

  it("cautious founders alternate saving with cadence-based job creation", () => {
    const owned = [
      ...companies,
      { id: "owned", founder_agent_id: agent.id, name: "Vega Co", cash: 1_000, valuation: 0 },
    ];
    expect(
      decideNpcAction(agent, profile("cautious_founder", { hire_every: 4 }, 1), owned).action,
    ).toBe("save_cash");
    expect(
      decideNpcAction(agent, profile("cautious_founder", { hire_every: 4 }, 3), owned).action,
    ).toBe("create_job");
  });

  it("serial acquirers first establish a holding company", () => {
    expect(decideNpcAction(agent, profile("serial_acquirer"), companies).action).toBe(
      "create_company",
    );
  });

  it("serial acquirers periodically bid only on low-valuation targets", () => {
    const owned = {
      id: "owned",
      founder_agent_id: agent.id,
      name: "Vega Holdings",
      cash: 2_000,
      valuation: 0,
    };
    const decision = decideNpcAction(
      agent,
      profile("serial_acquirer", { cadence: 3, valuation_threshold: 5_000 }, 2),
      [...companies, owned],
    );
    expect(decision).toMatchObject({
      action: "acquire",
      acquirer_company_id: "owned",
      target_company_id: "low",
    });
  });

  it("serial acquirers save outside their deal cadence", () => {
    const owned = {
      id: "owned",
      founder_agent_id: agent.id,
      name: "Vega Holdings",
      cash: 2_000,
      valuation: 0,
    };
    expect(
      decideNpcAction(agent, profile("serial_acquirer", { cadence: 3 }, 1), [
        ...companies,
        owned,
      ]).action,
    ).toBe("save_cash");
  });

  it("strugglers never burn more than their remaining cash", () => {
    const decision = decideNpcAction(
      { ...agent, cash: 300 },
      profile("struggler", { burn_per_tick: 700 }),
      companies,
    );
    expect(decision).toMatchObject({ action: "struggle", amount: 300 });
  });
});
