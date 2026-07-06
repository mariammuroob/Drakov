export type RankedAgent = {
  id: string;
  name: string;
  value: number;
};

export type RankedCompany = {
  id: string;
  name: string;
  value: number;
  secondary?: string;
};

export type RankedFounder = RankedAgent & {
  companyCount: number;
};

export type RankedEmployee = RankedAgent & {
  companyId: string;
  companyName: string;
  role: string;
};

export type Leaderboards = {
  richestAgents: RankedAgent[];
  biggestCompanies: RankedCompany[];
  bestFounders: RankedFounder[];
  bestInvestors: RankedAgent[];
  highestPaidEmployees: RankedEmployee[];
  fastestGrowing: RankedCompany[];
};
