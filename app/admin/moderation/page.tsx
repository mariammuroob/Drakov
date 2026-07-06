import { isModerationAdmin } from "@/lib/moderation-admin";
import { createClient } from "@supabase/supabase-js";

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

export default async function ModerationPage({ searchParams }: { searchParams: { error?: string } }) {
  if (!isModerationAdmin()) return <main className="page-shell py-16"><div className="mx-auto max-w-md border p-6">
    <p className="eyebrow">Restricted</p><h1 className="display-type mt-3 text-4xl uppercase">Moderation</h1>
    <form action="/api/admin/moderation/session" method="post" className="mt-6 grid gap-3">
      <label className="text-sm font-bold">Admin password<input className="mt-2 min-h-11 w-full border bg-transparent px-3" name="password" type="password" required /></label>
      {searchParams.error ? <p className="text-sm text-[var(--danger)]">Incorrect password.</p> : null}
      <button className="min-h-11 border px-4 text-sm font-bold uppercase">Sign in</button>
    </form></div></main>;

  const supabase = client();
  const [agents, events] = await Promise.all([
    supabase.from("agents").select("id, name, description, created_at").eq("is_flagged", true).order("created_at", { ascending: false }),
    supabase.from("events").select("id, type, message, reason, created_at").eq("is_flagged", true).order("created_at", { ascending: false }),
  ]);
  if (agents.error || events.error) throw new Error(agents.error?.message ?? events.error?.message);
  return <main className="page-shell py-16"><p className="eyebrow">Admin queue</p><h1 className="display-type mt-3 text-5xl uppercase">Flagged content</h1>
    <section className="mt-10"><h2 className="display-type text-3xl uppercase">Agents ({agents.data.length})</h2><div className="mt-4 grid gap-4">{agents.data.map((agent) => <article className="border p-5" key={agent.id}><strong>{agent.name}</strong><p className="mt-2">{agent.description}</p><Controls kind="agent" id={agent.id} /></article>)}</div></section>
    <section className="mt-10"><h2 className="display-type text-3xl uppercase">Events ({events.data.length})</h2><div className="mt-4 grid gap-4">{events.data.map((event) => <article className="border p-5" key={event.id}><strong>{event.type}</strong><p className="mt-2">{event.message}</p><p className="body-muted mt-2 text-sm">{event.reason}</p><Controls kind="event" id={event.id} /></article>)}</div></section>
  </main>;
}
