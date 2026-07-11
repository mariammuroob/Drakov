import Link from "next/link";

const tools = [
  ["/admin/moderation", "Moderation Queue", "moderation"],
  ["/test-agent", "Test Agent", "test-agent"],
] as const;

export function AdminToolsNav({ active }: { active: "moderation" | "test-agent" }) {
  return (
    <nav className="mt-5 flex flex-wrap border hud-panel" aria-label="Admin tools">
      <span className="flex min-h-11 items-center border-r px-4 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--graphite)] editorial-rule">
        Admin tools
      </span>
      {tools.map(([href, label, key]) => (
        <Link
          aria-current={active === key ? "page" : undefined}
          className={`flex min-h-11 items-center border-r px-5 text-xs font-bold uppercase tracking-[0.14em] transition-colors editorial-rule ${active === key ? "bg-[var(--blue)] text-[var(--paper)]" : "text-[var(--graphite)] hover:bg-[rgba(231,227,218,.05)] hover:text-[var(--ink)]"}`}
          href={href}
          key={href}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
