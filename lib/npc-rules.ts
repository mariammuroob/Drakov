export type NpcArchetype =
  | "aggressive_investor"
  | "cautious_founder"
  | "serial_acquirer"
  | "struggler";

export type NpcAgent = {
  id: string;
  name: string;
  cash: number;
  status: string;
};

export type NpcCompany = {
  id: string;
  founder_agent_id: string;
  name: string;
  cash: number;
  valuation: number;
};

export type NpcProfile = {
  archetype: NpcArchetype;
  config: Record<string, unknown>;
  ticks_acted: number;
};

export type NpcDecision = Record<string, unknown> & {
  action: string;
  reason: string;
};

function configNumber(profile: NpcProfile, key: string, fallback: number) {
  const value = profile.config[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function configText(profile: NpcProfile, key: string, fallback: string) {
  const value = profile.config[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function decideNpcAction(
  agent: NpcAgent,
  profile: NpcProfile,
  companies: NpcCompany[],
): NpcDecision {
  const owned = companies.filter((company) => company.founder_agent_id === agent.id);

  switch (profile.archetype) {
    case "aggressive_investor": {
      const target = [...companies].sort((a, b) => b.valuation - a.valuation)[0];
      const amount = Math.round(
        agent.cash * configNumber(profile, "investment_pct", 0.2) * 100,
      ) / 100;
      if (!target || amount <= 0) {
        return { action: "save_cash", reason: "No investable market leader exists yet." };
      }
      return {
        action: "invest",
        reason: `${target.name} has the strongest valuation momentum.`,
        company_id: target.id,
        amount,
      };
    }

    case "cautious_founder": {
      if (!owned.length) {
        return {
          action: "create_company",
          reason: "A measured launch leaves enough runway for difficult turns.",
          name: `${agent.name} Company`,
          market: configText(profile, "market", "services"),
        };
      }
      const hireEvery = Math.max(2, Math.floor(configNumber(profile, "hire_every", 4)));
      if ((profile.ticks_acted + 1) % hireEvery === 0) {
        return {
          action: "create_job",
          reason: "The balance sheet can support one careful addition to the team.",
        };
      }
      return {
        action: "save_cash",
        reason: "Preserving runway is more valuable than forced expansion.",
      };
    }

    case "serial_acquirer": {
      if (!owned.length) {
        return {
          action: "create_company",
          reason: "A holding company is the first step toward consolidation.",
          name: `${agent.name} Holdings`,
          market: configText(profile, "market", "enterprise"),
        };
      }
      const cadence = Math.max(2, Math.floor(configNumber(profile, "cadence", 3)));
      const threshold = configNumber(profile, "valuation_threshold", 5_000);
      const target = companies
        .filter((company) => company.founder_agent_id !== agent.id && company.valuation < threshold)
        .sort((a, b) => a.valuation - b.valuation)[0];
      if ((profile.ticks_acted + 1) % cadence !== 0 || !target) {
        return { action: "save_cash", reason: "Waiting for the right acquisition window." };
      }
      const acquirer = owned[0];
      const offerAmount = Math.round(
        Math.min(acquirer.cash * 0.5, Math.max(100, target.valuation * 0.8)) * 100,
      ) / 100;
      if (offerAmount <= 0) {
        return { action: "save_cash", reason: "The acquisition vehicle needs more cash." };
      }
      return {
        action: "acquire",
        reason: `${target.name} is undervalued and fits the roll-up strategy.`,
        acquirer_company_id: acquirer.id,
        target_company_id: target.id,
        offer_amount: offerAmount,
      };
    }

    case "struggler":
      return {
        action: "struggle",
        reason: "Operating costs keep consuming the remaining runway.",
        amount: Math.min(agent.cash, configNumber(profile, "burn_per_tick", 500)),
      };
  }
}
