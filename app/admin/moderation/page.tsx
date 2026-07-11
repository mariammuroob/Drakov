import { isModerationAdmin } from "@/lib/moderation-admin";
import { createClient } from "@supabase/supabase-js";
import { SiteNav } from "@/components/site-nav";
import { AdminToolsNav } from "@/components/admin-tools-nav";
import { SegmentedStat } from "@/components/segmented-stat";

export const metadata = {
  title: "Admin Access",
  robots: { index: false, follow: false },
};

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function Controls({ kind, id }: { kind: "agent" | "event"; id: string }) {
  return <form action="/api/admin/moderation" method="post" className="mt-3 flex gap-2">
    <input type="hidden" name="kind" value={kind} /><input type="hidden" name="id" value={id} />
    <button className="border px-3 py-2 text-xs font-bold uppercase" name="action" value="approve">Approve</button>
    <button className="border px-3 py-2 text-xs font-bold uppercase text-[var(--danger)]" name="action" value="remove">Remove</button>
  </form>;
}

export default async function ModerationPage({ searchParams }: { searchParams: { error?: string; next?: string } }) {
  if (!isModerationAdmin()) return <main className="flex-1 pb-24"><div className="shell"><SiteNav /><div className="mx-auto mt-16 max-w-md border p-6 hud-panel">
    <p className="eyebrow">Separate administrator session</p><h1 className="display-type mt-3 text-4xl uppercase">Admin Access</h1>
    <p className="body-muted mt-3 text-sm leading-6">This password is separate from the regular magic-link user sign-in.</p>
    <form action="/api/admin/moderation/session" method="post" className="mt-6 grid gap-3">
      <input type="hidden" name="next" value={searchParams.next === "/test-agent" ? "/test-agent" : "/admin/moderation"} />
      <label className="text-sm font-bold">Admin password<input className="mt-2 min-h-11 w-full border bg-transparent px-3" name="password" type="password" required /></label>
      {searchParams.error ? <p className="text-sm text-[var(--danger)]">Incorrect password.</p> : null}
      <button className="min-h-11 border border-[var(--blue)] px-4 text-sm font-bold uppercase text-[var(--blue)]">Enter Admin Mode</button>
    </form></div></div></main>;

  const supabase = client();
  const [agents, events] = await Promise.all([
    supabase.from("agents").select("id, name, description, created_at").eq("is_flagged", true).order("created_at", { ascending: false }),
    supabase.from("events").select("id, type, message, reason, created_at").eq("is_flagged", true).order("created_at", { ascending: false }),
  ]);
  if (agents.error || events.error) throw new Error(agents.error?.message ?? events.error?.message);
  return <main className="flex-1 pb-24"><div className="shell"><SiteNav /><AdminToolsNav active="moderation" /><header className="flex flex-wrap items-start justify-between gap-5 py-10 sm:py-12 lg:py-16"><div><p className="eyebrow text-[var(--blue)]">Admin mode active</p><h1 className="display-type page-title mt-4">Flagged content</h1></div><form action="/api/admin/moderation/sign-out" method="post"><button className="min-h-11 border border-[var(--danger)] px-4 text-sm font-bold uppercase text-[var(--danger)]">Admin Sign Out</button></form></header>
    <div className="grid gap-10 border-x border-t px-5 py-10 editorial-rule sm:px-8 lg:grid-cols-2 lg:px-10">
      <section><h2 className="display-type flex items-center gap-3 text-3xl uppercase">Agents <SegmentedStat label="Flagged agents" size="compact" tone="blue" value={agents.data.length} /></h2><div className="mt-4 grid gap-4">{agents.data.map((agent) => <article className="paper-card p-5" key={agent.id}><strong>{agent.name}</strong><p className="body-muted mt-2 leading-6">{agent.description}</p><Controls kind="agent" id={agent.id} /></article>)}</div></section>
      <section><h2 className="display-type flex items-center gap-3 text-3xl uppercase">Events <SegmentedStat label="Flagged events" size="compact" tone="blue" value={events.data.length} /></h2><div className="mt-4 grid gap-4">{events.data.map((event) => <article className="paper-card p-5" key={event.id}><strong>{event.type}</strong><p className="mt-2 leading-6">{event.message}</p><p className="body-muted mt-2 text-sm">{event.reason}</p><Controls kind="event" id={event.id} /></article>)}</div></section>
    </div>
  </div></main>;
}
