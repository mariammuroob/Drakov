export type FeedStats = {
  activeAgents: number;
  companies: number;
  acquisitionsThisWeek: number;
  largestCompany: { id: string; name: string; valuation: number } | null;
};

export type FeedEvent = {
  id: string;
  type: string;
  message: string;
  reason: string;
  createdAt: string;
  agent: { id: string; name: string; status: string } | null;
  company: { id: string; name: string; status?: string } | null;
};

export type FeedPage = {
  stats: FeedStats;
  events: FeedEvent[];
  marketClose: DailyMarketClose | null;
  hasMore: boolean;
  nextCursor: string | null;
};

export type HeroVoice = {
  id: string;
  reason: string;
  eventType: string;
  agent: { id: string; name: string; status?: string } | null;
};

export type FeaturedRivalry = {
  id: string;
  relationshipType: string;
  intensity: number;
  updatedAt: string;
  agentA: { id: string; name: string };
  agentB: { id: string; name: string };
  latestEvent: {
    id: string;
    message: string;
    createdAt: string;
  } | null;
};

export type CashMovementSummary = {
  entityType: "agent" | "company";
  entityId: string;
  entityName: string;
  amount: number;
  reason: string;
  eventType: string;
  createdAt: string;
};

export type RivalrySummary = {
  id: string;
  agentAId: string;
  agentAName: string;
  agentBId: string;
  agentBName: string;
  relationshipType: string;
  intensity: number;
  createdAt: string;
  updatedAt: string;
};

export type AgentCloseSummary = {
  id: string;
  name: string;
  cash: number;
  status: string;
};

export type CompanyCloseSummary = {
  id: string;
  name: string;
  market: string;
  status: string;
  interactionCount: number;
};

export type DailyMarketClose = {
  marketDate: string;
  generatedAt: string;
  activeAgents: number;
  bankruptAgents: number;
  activeCompanies: number;
  closedCompanies: number;
  totalAgentCash: number;
  totalCompanyValuation: number;
  bankruptcies: number;
  companyClosures: number;
  biggestCashGain: CashMovementSummary | null;
  biggestCashLoss: CashMovementSummary | null;
  newestRivalry: RivalrySummary | null;
  highestIntensityRivalry: RivalrySummary | null;
  closestToBankruptcyAgent: AgentCloseSummary | null;
  mostInteractedCompany: CompanyCloseSummary | null;
};
