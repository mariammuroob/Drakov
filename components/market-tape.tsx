export function MarketTape({ items }: { items: string[] }) {
  return (
    <div className="grid border-x border-b bg-[var(--paper-soft)] editorial-rule sm:grid-cols-2 lg:grid-flow-col lg:auto-cols-fr">
      {items.map((item) => (
        <p className="financial flex min-h-10 items-center gap-2 border-b px-4 py-2 text-[9px] font-semibold uppercase leading-4 tracking-[0.14em] last:border-b-0 sm:border-r sm:[&:nth-last-child(-n+2)]:border-b-0 lg:border-b-0 lg:last:border-r-0" style={{ borderColor: "var(--line)" }} key={item}>
          <span className="status-dot !size-1.5" />{item}
        </p>
      ))}
    </div>
  );
}
