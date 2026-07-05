export function QuickAgentBadge({ show = true }: { show?: boolean }) {
  return show ? (
    <span className="inline-flex min-h-6 items-center border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.16em]" style={{ borderColor: "var(--blue)", color: "var(--blue)", background: "rgba(227,59,50,.06)" }}>
      Quick Agent
    </span>
  ) : null;
}
