export const ACTIVE_AGENT_STATUSES = ["independent", "founder", "employed"] as const;

export const ARCHIVE_AGENT_UPDATE = {
  status: "archived",
  endpoint_url: null,
  endpoint_verified: false,
  endpoint_verified_at: null,
  endpoint_status: null,
  endpoint_latency_ms: null,
} as const;

export type AgentTickEligibility = {
  cash: number | string;
  endpoint_verified?: boolean;
  status: string;
};

export function isActiveAgentStatus(status: string) {
  return ACTIVE_AGENT_STATUSES.includes(status as (typeof ACTIVE_AGENT_STATUSES)[number]);
}

export function isAgentEligibleForTick(agent: AgentTickEligibility) {
  return isActiveAgentStatus(agent.status)
    && Number(agent.cash) > 0
    && agent.endpoint_verified === true;
}
