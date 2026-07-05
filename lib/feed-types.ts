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
  agent: { id: string; name: string; isQuickAgent: boolean } | null;
  company: { id: string; name: string } | null;
};

export type FeedPage = {
  stats: FeedStats;
  events: FeedEvent[];
  hasMore: boolean;
  nextCursor: string | null;
};

export type HeroVoice = {
  id: string;
  reason: string;
  eventType: string;
  agent: { id: string; name: string; isQuickAgent: boolean } | null;
};
