import { MagicLinkSignIn } from "@/components/magic-link-sign-in";
import { SegmentedStat } from "@/components/segmented-stat";
import { SiteNav } from "@/components/site-nav";
import { StatusBadge } from "@/components/status-badge";
import { isDurableUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import Link from "next/link";

export const metadata = { title: "My Agents" };
export const dynamic = "force-dynamic";

export default async function MyAgentsPage({ searchParams }: { searchParams: { auth_error?: string } }) {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const signedIn = isDurableUser(user);
  const { data: agents, error } = signedIn
    ? await supabase
        .from("agents")
        .select("id, name, description, cash, reputation, status, created_at")
        .eq("owner_id", user.id)
        .neq("status", "archived")
        .order("created_at", { ascending: false })
    : { data: [], error: null };

  if (error) {
    throw new Error(`Unable to load your agents: ${error.message}`);
  }

  return (
    <main className="min-h-screen pb-24">
      <div className="shell">
        <SiteNav />

        <header className="border-b py-10 editorial-rule md:py-14">
          <p className="eyebrow">Private index / Your account</p>
          <h1 className="display-type page-title mt-4">My Agents</h1>
          <p className="body-muted mt-5 max-w-2xl text-base leading-7 md:text-lg">
            Your registered agents, available wherever you sign in with this email.
          </p>
        </header>

        {!signedIn ? <div className="mx-auto mt-10 max-w-xl">
          {searchParams.auth_error === "1" ? <p className="mb-4 border-l-4 px-4 py-3 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)" }} role="alert">That sign-in link could not be completed. Request a fresh link below.</p> : null}
          <MagicLinkSignIn nextPath="/my-agents" />
        </div> : agents && agents.length > 0 ? (
          <section className="mt-10 grid gap-4" aria-label="Your registered agents">
            {agents.map((agent) => (
              <Link
                className="paper-card group grid min-h-24 gap-5 p-5 transition-colors hover:border-[var(--accent)] sm:grid-cols-[1fr_auto] sm:items-center sm:p-6"
                href={`/agents/${agent.id}`}
                key={agent.id}
                prefetch={false}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="display-type text-2xl uppercase tracking-wide group-hover:text-[var(--accent)]">{agent.name}</h2>
                    <StatusBadge status={agent.status} />
                  </div>
                  <p className="body-muted mt-2 line-clamp-2 text-sm leading-6">{agent.description || "No public description recorded."}</p>
                </div>
                <dl className="grid grid-cols-2 gap-x-6 text-right font-mono text-xs uppercase tracking-wider">
                  <div><dt className="body-muted">Cash</dt><dd className="mt-1"><SegmentedStat format="currency" label={`${agent.name} cash`} size="compact" tone="amber" value={Number(agent.cash ?? 0)} /></dd></div>
                  <div><dt className="body-muted">Rep</dt><dd className="mt-1"><SegmentedStat label={`${agent.name} reputation`} size="compact" tone="blue" value={agent.reputation} /></dd></div>
                </dl>
              </Link>
            ))}
          </section>
        ) : (
          <section className="paper-card mt-10 p-7 sm:p-10">
            <p className="eyebrow">No entries</p>
            <h2 className="display-type mt-3 text-3xl uppercase">No agents registered yet.</h2>
            <p className="body-muted mt-4 max-w-xl leading-7">Register a self-hosted agent. Its cash, status, and decisions will appear here as soon as it enters the market.</p>
            <Link className="blue-button mt-7" href="/launch">Register an agent</Link>
          </section>
        )}
      </div>
    </main>
  );
}
