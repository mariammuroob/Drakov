"use client";

import type { NetworkData, NetworkNode } from "@/lib/network-data";
import Link from "next/link";
import { useState } from "react";

const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

function hash(value: string) {
  return [...value].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 7);
}

function position(node: NetworkNode, index: number, total: number) {
  const angle = (index / Math.max(total, 1)) * Math.PI * 2 + (hash(node.id) % 31) / 31;
  const ring = node.kind === "agent" ? 0.72 : 1;
  return { x: 500 + Math.cos(angle) * 390 * ring, y: 260 + Math.sin(angle) * 190 * ring };
}

export function LiveNetworkMap({ data }: { data: NetworkData }) {
  const [active, setActive] = useState<NetworkNode | null>(null);
  if (!data.canRenderGraph) {
    const stats = [["Agents", data.totals.agents], ["Companies", data.totals.companies], ["Investments", data.totals.investments], ["Rivalries", data.totals.rivalries]];
    return (
      <div className="network-fallback" data-testid="network-fallback">
        <p className="body-muted max-w-2xl text-sm leading-6">The network is still forming. These are the relationships on record now; the map will appear once at least six connected entities and three relationships exist.</p>
        <div className="mt-7 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-4">
          {stats.map(([label, value]) => <div className="network-stat" key={label}><p className="eyebrow">{label}</p><p className="financial mt-2 text-3xl font-semibold">{value}</p></div>)}
        </div>
      </div>
    );
  }
  const positions = new Map(data.nodes.map((node, index) => [node.id, position(node, index, data.nodes.length)]));
  const maxValue = Math.max(...data.nodes.map((node) => node.value), 1);
  return (
    <div className="network-frame">
      <svg aria-label="Live company and agent relationship network" className="network-svg" role="img" viewBox="0 0 1000 520">
        <g aria-hidden="true">
          {data.edges.map((edge) => { const a = positions.get(edge.source)!; const b = positions.get(edge.target)!; return <line className={edge.activeRivalry ? "network-edge network-edge-rivalry" : "network-edge"} key={edge.id} x1={a.x} x2={b.x} y1={a.y} y2={b.y} />; })}
        </g>
        {data.nodes.map((node) => { const point = positions.get(node.id)!; const radius = 9 + Math.log1p(node.value) / Math.log1p(maxValue) * 14; return (
          <Link aria-label={`${node.name}, ${node.kind}, ${money(node.value)}`} href={node.href} key={`${node.kind}-${node.id}`} onBlur={() => setActive(null)} onFocus={() => setActive(node)} onMouseEnter={() => setActive(node)} onMouseLeave={() => setActive(null)}>
            <circle className={`network-node network-node-${node.kind}`} cx={point.x} cy={point.y} r={radius} />
          </Link>
        ); })}
      </svg>
      <div aria-live="polite" className="network-tooltip">
        {active ? <><span className="eyebrow">{active.kind} / {active.status}</span><strong>{active.name}</strong><span className="financial">{active.kind === "company" ? "Valuation" : "Cash"}: {money(active.value)}</span></> : <span className="body-muted">Hover or focus a node to inspect it.</span>}
      </div>
      <div className="network-legend"><span><i className="legend-blue" /> Capital / ownership</span><span><i className="legend-red" /> Active rivalry</span></div>
    </div>
  );
}
