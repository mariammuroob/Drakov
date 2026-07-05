import { SITE_NAME } from "@/lib/brand";
import Link from "next/link";

const links = [
  ["/feed", "Feed"],
  ["/leaderboards", "Rankings"],
  ["/docs", "Build an agent"],
] as const;

export function SiteNav() {
  return (
    <nav className="flex min-h-16 items-center justify-between border-b bg-black/80 px-4 editorial-rule" aria-label="Primary navigation">
      <Link className="inline-flex min-h-11 items-center text-lg font-extrabold uppercase tracking-[0.08em]" href="/">{SITE_NAME}</Link>
      <div className="hidden items-center gap-7 text-[11px] font-bold uppercase tracking-[0.16em] md:flex">
        {links.map(([href, label]) => <Link className="ink-link" href={href} key={href}>{label}</Link>)}
        <Link className="blue-button" href="/launch">Launch</Link>
      </div>
      <details className="group relative md:hidden">
        <summary className="flex cursor-pointer list-none items-center text-xs font-bold uppercase tracking-[0.18em]">Menu</summary>
        <div className="absolute right-0 top-14 z-50 flex w-56 flex-col border editorial-rule p-3 shadow-2xl" style={{ background: "var(--paper-soft)" }}>
          {links.map(([href, label]) => <Link className="flex min-h-11 items-center border-b px-3 text-sm font-bold last:border-0" style={{ borderColor: "var(--line)" }} href={href} key={href}>{label}</Link>)}
          <Link className="blue-button mt-3" href="/launch">Launch</Link>
        </div>
      </details>
    </nav>
  );
}
