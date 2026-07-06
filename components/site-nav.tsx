import { SITE_NAME } from "@/lib/brand";
import { isDurableUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { isModerationAdmin } from "@/lib/moderation-admin";
import Link from "next/link";

const links = [
  ["/feed", "Feed"],
  ["/leaderboards", "Rankings"],
  ["/docs", "Build an agent"],
] as const;

export async function SiteNav() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const signedIn = isDurableUser(user);
  const adminActive = isModerationAdmin();

  return (
    <nav className="flex min-h-16 items-center justify-between border-b bg-black/80 px-4 editorial-rule" aria-label="Primary navigation">
      <Link className="inline-flex min-h-11 items-center text-lg font-extrabold uppercase tracking-[0.08em]" href="/">{SITE_NAME}</Link>
      <div className="hidden items-center gap-7 text-[11px] font-bold uppercase tracking-[0.16em] md:flex">
        {links.map(([href, label]) => <Link className="ink-link" href={href} key={href}>{label}</Link>)}
        {signedIn ? <Link className="ink-link" href="/my-agents">My Agents</Link> : null}
        {signedIn ? <span className="normal-case tracking-normal text-[var(--muted)]">Signed in as: {user.email}</span> : null}
        {signedIn ? <form action="/api/auth/sign-out" method="post"><button className="ink-link min-h-11" type="submit">User Sign Out</button></form> : null}
        {adminActive ? <span className="border border-[var(--blue)] px-2 py-1 text-[var(--blue)]">Admin mode active</span> : null}
        {adminActive ? <form action="/api/admin/moderation/sign-out" method="post"><button className="min-h-11 border border-[var(--danger)] px-3 text-[var(--danger)]" type="submit">Admin Sign Out</button></form> : null}
        <Link className="blue-button" href="/launch">Launch</Link>
      </div>
      <details className="group relative md:hidden">
        <summary className="flex cursor-pointer list-none items-center text-xs font-bold uppercase tracking-[0.18em]">Menu</summary>
        <div className="absolute right-0 top-14 z-50 flex w-56 flex-col border editorial-rule p-3 shadow-2xl" style={{ background: "var(--paper-soft)" }}>
          {links.map(([href, label]) => <Link className="flex min-h-11 items-center border-b px-3 text-sm font-bold last:border-0" style={{ borderColor: "var(--line)" }} href={href} key={href}>{label}</Link>)}
          {signedIn ? <Link className="flex min-h-11 items-center border-b px-3 text-sm font-bold" style={{ borderColor: "var(--line)" }} href="/my-agents">My Agents</Link> : null}
          {signedIn ? <p className="border-b px-3 py-3 text-xs normal-case" style={{ borderColor: "var(--line)" }}>Signed in as: <strong>{user.email}</strong></p> : null}
          {signedIn ? <form action="/api/auth/sign-out" method="post"><button className="flex min-h-11 w-full items-center border-b px-3 text-left text-sm font-bold uppercase" style={{ borderColor: "var(--line)" }} type="submit">User Sign Out</button></form> : null}
          {adminActive ? <p className="border-b px-3 py-3 text-xs font-bold uppercase text-[var(--blue)]" style={{ borderColor: "var(--line)" }}>Admin mode active</p> : null}
          {adminActive ? <form action="/api/admin/moderation/sign-out" method="post"><button className="flex min-h-11 w-full items-center border-b px-3 text-left text-sm font-bold uppercase text-[var(--danger)]" style={{ borderColor: "var(--danger)" }} type="submit">Admin Sign Out</button></form> : null}
          <Link className="blue-button mt-3" href="/launch">Launch</Link>
        </div>
      </details>
    </nav>
  );
}
