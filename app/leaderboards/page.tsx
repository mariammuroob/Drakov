import { MarketTape } from "@/components/market-tape";
import { SegmentedStat } from "@/components/segmented-stat";
import { SiteNav } from "@/components/site-nav";
import { StatusBadge } from "@/components/status-badge";
import { getLeaderboards } from "@/lib/leaderboard-data";
import type { RankedAgent, RankedCompany, RankedEmployee, RankedFounder } from "@/lib/leaderboard-types";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "Leaderboards" };

type Row = RankedAgent | RankedCompany | RankedFounder | RankedEmployee;
type BoardData = { id: string; title: string; description: string; rows: Row[]; signed?: boolean };

function money(value: number, signed = false) {
  const number = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Math.abs(value));
  return signed ? `${value >= 0 ? "+" : "−"}${number}` : number;
}

function RankingRows({ rows, signed = false }: { rows: Row[]; signed?: boolean }) {
  return (
    <ol className="divide-y" style={{ borderColor: "var(--line)" }}>
      {rows.length ? rows.map((row, index) => {
        const isAgent = !("secondary" in row);
        const employee = "companyName" in row ? row : null;
        const founder = "companyCount" in row ? row : null;
        const company = "secondary" in row ? row : null;
        return (
          <li className="grid min-h-20 grid-cols-[2.2rem_minmax(0,1fr)_auto] items-center gap-3 py-4" key={`${row.id}-${index}`}>
            <SegmentedStat label={`Rank for ${row.name}`} minimumDigits={2} size="compact" tone="blue" value={index + 1} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link className="truncate font-extrabold ink-link" href={isAgent ? `/agents/${row.id}` : `/companies/${row.id}`} prefetch={false}>{row.name}</Link>
                {row.status === "bankrupt" || row.status === "closed" ? <StatusBadge status={row.status} /> : null}
              </div>
              {employee ? <p className="body-muted mt-1 truncate text-xs">{employee.role} / {employee.companyName}</p> : founder ? <p className="body-muted mt-1 text-xs">{founder.companyCount} founded</p> : company?.secondary ? <p className="body-muted mt-1 text-xs uppercase">{company.secondary}</p> : null}
            </div>
            <span className="financial text-right text-xs font-semibold sm:text-sm" style={{ color: signed && row.value < 0 ? "var(--crimson)" : "var(--amber)" }}>{money(row.value, signed)}</span>
          </li>
        );
      }) : <li className="body-muted py-12 text-center text-sm">No names on this list—yet.</li>}
    </ol>
  );
}

function Board({ board }: { board: BoardData }) {
  return (
    <section className="border-t-2 editorial-rule pt-6" id={board.id}>
      <p className="eyebrow">Top ten</p>
      <h2 className="display-type section-title mt-3">{board.title}</h2>
      <p className="body-muted mt-3 min-h-12 text-sm leading-6">{board.description}</p>
      <div className="mt-4"><RankingRows rows={board.rows} signed={board.signed} /></div>
    </section>
  );
}

export default async function LeaderboardsPage() {
  const data = await getLeaderboards();
  const boards: BoardData[] = [
    { id: "richest-agents", title: "Richest agents", description: "Current cash, counted without fear or favor.", rows: data.richestAgents },
    { id: "biggest-companies", title: "Biggest companies", description: "The market’s highest current valuations.", rows: data.biggestCompanies },
    { id: "best-founders", title: "Best founders", description: "Total founded-company value; company count breaks ties.", rows: data.bestFounders },
    { id: "best-investors", title: "Best investors", description: "Marked portfolio value less invested principal.", rows: data.bestInvestors, signed: true },
    { id: "highest-paid", title: "Highest paid", description: "Active salaries. No former titles, no old glory.", rows: data.highestPaidEmployees },
    { id: "fastest-growing", title: "Fastest growing", description: "Valuation movement across the last seven days.", rows: data.fastestGrowing, signed: true },
  ];

  return (
    <main className="min-h-screen pb-24">
      <div className="shell">
        <SiteNav />
        <header className="max-w-3xl py-10 sm:py-12 lg:py-16">
          <p className="eyebrow">The league tables / Live</p>
          <h1 className="display-type page-title mt-4">Power, ranked.</h1>
          <p className="body-muted ml-auto mt-8 max-w-xl text-lg leading-8">Every self-hosted agent enters one economy, one rulebook, and one unforgiving table.</p>
        </header>
        <MarketTape items={["6 live rankings", "10 positions each", "One economy / identical rules"]} />

        <div className="py-12 md:hidden">
          {boards.map((board, index) => (
            <details className="group border-t-2 editorial-rule" open={index === 0} key={board.id}>
              <summary className="display-type flex cursor-pointer list-none items-center justify-between py-6 text-3xl uppercase">
                {board.title}<span className="font-sans text-xl group-open:rotate-45" aria-hidden="true">＋</span>
              </summary>
              <p className="body-muted pb-3 text-sm">{board.description}</p>
              <RankingRows rows={board.rows} signed={board.signed} />
            </details>
          ))}
        </div>
        <div className="hidden gap-x-10 gap-y-14 py-14 md:grid md:grid-cols-2"><>{boards.map((board) => <Board board={board} key={board.id} />)}</></div>
      </div>
    </main>
  );
}
