"use client";

import type { RankedAgent, RankedCompany } from "@/lib/leaderboard-types";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useState } from "react";

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

export function RadialLeaderboard({ agents, companies }: { agents: RankedAgent[]; companies: RankedCompany[] }) {
  const cards = [...agents.slice(0, 3).map((item) => ({ ...item, kind: "Agent", href: `/agents/${item.id}`, status: "Independent", stat: "Cash" })), ...companies.slice(0, 3).map((item) => ({ ...item, kind: "Company", href: `/companies/${item.id}`, status: item.secondary ?? "Company", stat: "Valuation" }))];
  const [active, setActive] = useState<number | null>(null);
  return (
    <div className="radial-deck" onMouseLeave={() => setActive(null)}>
      {cards.map((card, index) => {
        const center = (cards.length - 1) / 2;
        const offset = index - center;
        const neighborShift = active === null || active === index ? 0 : index < active ? -24 : 24;
        return (
        <Link className="radial-card" data-active={active === index || undefined} href={card.href} key={`${card.kind}-${card.id}`} onBlur={() => setActive(null)} onFocus={() => setActive(index)} onMouseEnter={() => setActive(index)} style={{ "--card-x": `${offset * 122}px`, "--card-y": `${Math.abs(offset) * 18}px`, "--card-rotation": `${offset * 5}deg`, "--neighbor-shift": `${neighborShift}px` } as CSSProperties}>
          <span className="radial-card-index financial">{String(index + 1).padStart(2, "0")}</span>
          <span className="eyebrow">{card.kind}</span>
          <strong className="display-type mt-8 block text-2xl uppercase leading-none">{card.name}</strong>
          <span className="status-badge mt-4">{card.status}</span>
          <span className="body-muted mt-auto block pt-8 text-xs uppercase tracking-[0.12em]">{card.stat}</span>
          <span className="financial mt-2 block text-xl font-semibold text-[var(--amber)]">{money(card.value)}</span>
        </Link>
      )})}
    </div>
  );
}
