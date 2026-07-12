import { moderationError } from "./content-moderation";

export const FOUNDING_COST = 1_000;

export type AgentState = {
  id: string;
  name: string;
  cash: number;
  status: string;
};

export type CompanyState = {
  id: string;
  founder_agent_id: string;
  successor_agent_id?: string | null;
  name: string;
  market: string;
  cash: number;
  valuation: number;
  status?: string;
};

export type JobState = {
  id: string;
  company_id: string;
  title: string;
  salary: number;
  equity_pct: number;
  status: string;
};

export type EmploymentState = {
  id: string;
  company_id: string;
  role: string;
};

export type ActionWorldState = {
  agent: AgentState;
  companies: CompanyState[];
  jobs?: JobState[];
  activeEmployment?: EmploymentState | null;
  partnershipPairs?: Array<[string, string]>;
  pendingAcquisitions?: Array<[string, string]>;
};

export type ActionPlan = {
  action: string;
  event: { type: string; message: string; reason: string; companyId?: string };
  values: Record<string, unknown>;
};

export class ActionRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActionRejectedError";
  }
}

function text(input: Record<string, unknown>, key: string) {
  const value = input[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new ActionRejectedError(`${key} is required.`);
  }
  return value.trim();
}

function positiveNumber(input: Record<string, unknown>, key: string) {
  const value = input[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ActionRejectedError(`${key} must be a positive number.`);
  }
  return value;
}

function company(state: ActionWorldState, id: string) {
  const match = state.companies.find((candidate) => candidate.id === id);
  if (!match) throw new ActionRejectedError("Company does not exist.");
  if (match.status === "closed") throw new ActionRejectedError("Company is closed.");
  return match;
}

function controllerId(company: CompanyState) {
  return company.successor_agent_id ?? company.founder_agent_id;
}

function pairExists(pairs: Array<[string, string]> | undefined, a: string, b: string) {
  return Boolean(pairs?.some(([left, right]) =>
    (left === a && right === b) || (left === b && right === a)));
}

export function planCreateCompany(
  state: ActionWorldState,
  input: Record<string, unknown>,
): ActionPlan {
  const reason = text(input, "reason");
  const name = text(input, "name");
  const market = text(input, "market");
  if (state.agent.cash < FOUNDING_COST) {
    throw new ActionRejectedError("Insufficient cash to found a company.");
  }
  return {
    action: "create_company",
    values: { name, market, foundingCost: FOUNDING_COST },
    event: {
      type: "company_founded",
      message: `${state.agent.name} founded ${name} in the ${market} market.`,
      reason,
    },
  };
}

export function planApplyJob(
  state: ActionWorldState,
  input: Record<string, unknown>,
): ActionPlan {
  const reason = text(input, "reason");
  const jobId = text(input, "job_id");
  const job = state.jobs?.find((candidate) => candidate.id === jobId);
  if (!job || job.status !== "open") {
    throw new ActionRejectedError("Job is not open.");
  }
  if (state.activeEmployment) {
    throw new ActionRejectedError("Agent already has an active employment.");
  }
  const employer = company(state, job.company_id);
  return {
    action: "apply_job",
    values: { jobId, job },
    event: {
      type: "job_filled",
      companyId: employer.id,
      message: `${state.agent.name} joined ${employer.name} as ${job.title}.`,
      reason,
    },
  };
}

export function planInvest(
  state: ActionWorldState,
  input: Record<string, unknown>,
): ActionPlan {
  const reason = text(input, "reason");
  const companyId = text(input, "company_id");
  const amount = positiveNumber(input, "amount");
  const target = company(state, companyId);
  if (state.agent.cash < amount) {
    throw new ActionRejectedError("Insufficient cash for investment.");
  }
  const ownershipPct =
    target.valuation === 0 ? 100 : Math.min(100, (amount / target.valuation) * 100);
  return {
    action: "invest",
    values: { companyId, amount, ownershipPct },
    event: {
      type: "investment",
      companyId,
      message: `${state.agent.name} invested $${amount.toFixed(2)} in ${target.name}.`,
      reason,
    },
  };
}

export function planPartner(
  state: ActionWorldState,
  input: Record<string, unknown>,
): ActionPlan {
  const reason = text(input, "reason");
  const companyAId = text(input, "company_a_id");
  const companyBId = text(input, "company_b_id");
  if (companyAId === companyBId) {
    throw new ActionRejectedError("A company cannot partner with itself.");
  }
  const a = company(state, companyAId);
  const b = company(state, companyBId);
  if (controllerId(a) !== state.agent.id && controllerId(b) !== state.agent.id) {
    throw new ActionRejectedError("Agent must control one partner company.");
  }
  if (pairExists(state.partnershipPairs, companyAId, companyBId)) {
    throw new ActionRejectedError("Partnership already exists.");
  }
  return {
    action: "partner",
    values: { companyAId, companyBId },
    event: {
      type: "partnership",
      companyId: controllerId(a) === state.agent.id ? a.id : b.id,
      message: `${a.name} partnered with ${b.name}.`,
      reason,
    },
  };
}

export function planAcquire(
  state: ActionWorldState,
  input: Record<string, unknown>,
): ActionPlan {
  const reason = text(input, "reason");
  const acquirerCompanyId = text(input, "acquirer_company_id");
  const targetCompanyId = text(input, "target_company_id");
  const offerAmount = positiveNumber(input, "offer_amount");
  if (acquirerCompanyId === targetCompanyId) {
    throw new ActionRejectedError("A company cannot acquire itself.");
  }
  const acquirer = company(state, acquirerCompanyId);
  const target = company(state, targetCompanyId);
  if (controllerId(acquirer) !== state.agent.id) {
    throw new ActionRejectedError("Agent must control the acquirer company.");
  }
  if (acquirer.cash < offerAmount) {
    throw new ActionRejectedError("Acquirer has insufficient cash for the offer.");
  }
  if (pairExists(state.pendingAcquisitions, acquirerCompanyId, targetCompanyId)) {
    throw new ActionRejectedError("A pending acquisition already exists.");
  }
  return {
    action: "acquire",
    values: { acquirerCompanyId, targetCompanyId, offerAmount },
    event: {
      type: "acquisition_offered",
      companyId: acquirer.id,
      message: `${acquirer.name} offered $${offerAmount.toFixed(2)} to acquire ${target.name}.`,
      reason,
    },
  };
}

export function planQuit(
  state: ActionWorldState,
  input: Record<string, unknown>,
): ActionPlan {
  const reason = text(input, "reason");
  if (!state.activeEmployment) {
    throw new ActionRejectedError("Agent has no active employment to quit.");
  }
  const employer = company(state, state.activeEmployment.company_id);
  return {
    action: "quit",
    values: { employmentId: state.activeEmployment.id },
    event: {
      type: "employment_ended",
      companyId: employer.id,
      message: `${state.agent.name} quit ${employer.name}.`,
      reason,
    },
  };
}

export function planSaveCash(
  state: ActionWorldState,
  input: Record<string, unknown>,
): ActionPlan {
  const reason = text(input, "reason");
  return {
    action: "save_cash",
    values: {},
    event: {
      type: "cash_saved",
      message: `${state.agent.name} chose to save cash this turn.`,
      reason,
    },
  };
}

export function planPost(
  state: ActionWorldState,
  input: Record<string, unknown>,
): ActionPlan {
  const reason = text(input, "reason");
  const message = text(input, "message");
  const contentError = moderationError("Post message", message);
  if (contentError) throw new ActionRejectedError(contentError);
  return {
    action: "post",
    values: { post: message },
    event: { type: "post", message: `${state.agent.name}: ${message}`, reason },
  };
}

export function planAction(
  state: ActionWorldState,
  input: Record<string, unknown>,
): ActionPlan {
  switch (input.action) {
    case "create_company": return planCreateCompany(state, input);
    case "apply_job": return planApplyJob(state, input);
    case "invest": return planInvest(state, input);
    case "partner": return planPartner(state, input);
    case "acquire": return planAcquire(state, input);
    case "quit": return planQuit(state, input);
    case "save_cash": return planSaveCash(state, input);
    case "post": return planPost(state, input);
    default: throw new ActionRejectedError("Unsupported action.");
  }
}
