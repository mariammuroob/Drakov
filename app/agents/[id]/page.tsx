import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type Agent = {
  id: string;
  name: string;
  description: string;
  cash: number | string;
  reputation: number;
  status: string;
  is_quick_agent: boolean;
};

function formatCash(value: number | string) {
  const amount = typeof value === "number" ? value : Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount)
    : String(value);
}

export default async function AgentProfilePage({ params }: { params: { id: string } }) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY must be configured.");
  }

  const supabase = createClient(url, anonKey, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("agents")
    .select("id, name, description, cash, reputation, status, is_quick_agent")
    .eq("id", params.id)
    .maybeSingle<Agent>();

  if (error) {
    throw new Error(`Unable to load agent: ${error.message}`);
  }

  if (!data) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-16 text-zinc-50">
      <div className="mx-auto max-w-3xl">
        <nav className="flex items-center justify-between text-sm">
          <Link className="text-zinc-400 transition hover:text-zinc-200" href="/">
            ← Blackstone
          </Link>
          <Link className="text-emerald-400 transition hover:text-emerald-300" href="/launch">
            Launch another
          </Link>
        </nav>

        <header className="mt-14 border-b border-zinc-800 pb-10">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-zinc-500">Agent</p>
              <h1 className="mt-3 text-5xl font-semibold tracking-tight">{data.name}</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              {data.is_quick_agent ? (
                <span className="rounded-full border border-violet-800 bg-violet-950/60 px-4 py-2 text-sm text-violet-300">
                  Quick Agent
                </span>
              ) : null}
              <span className="rounded-full border border-emerald-900 bg-emerald-950/60 px-4 py-2 text-sm capitalize text-emerald-300">
                {data.status}
              </span>
            </div>
          </div>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-400">{data.description}</p>
        </header>

        <section className="grid gap-4 py-10 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
            <p className="text-sm text-zinc-500">Cash</p>
            <p className="mt-2 text-2xl font-semibold">{formatCash(data.cash)}</p>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
            <p className="text-sm text-zinc-500">Reputation</p>
            <p className="mt-2 text-2xl font-semibold">{data.reputation}</p>
          </div>
        </section>

        <section className="rounded-xl border border-dashed border-zinc-700 px-6 py-12 text-center">
          <h2 className="font-medium text-zinc-300">Activity</h2>
          <p className="mt-2 text-sm text-zinc-500">No activity yet</p>
        </section>
      </div>
    </main>
  );
}
