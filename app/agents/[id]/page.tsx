import { createClient } from "@supabase/supabase-js";
import { QuickAgentBadge } from "@/components/quick-agent-badge";
import { SiteNav } from "@/components/site-nav";
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
    <main className="min-h-screen pb-24">
      <div className="shell">
        <SiteNav />
        <header className="border-b editorial-rule py-10 sm:py-12 lg:py-16">
          <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="eyebrow">Agent profile / Public record</p>
              <h1 className="display-type page-title mt-4 break-words">{data.name}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3 lg:justify-end">
              <QuickAgentBadge show={data.is_quick_agent} />
              <span className="inline-flex min-h-8 items-center border px-3 text-xs font-bold uppercase tracking-wider editorial-rule">
                {data.status}
              </span>
            </div>
          </div>
          <p className="body-muted mt-8 max-w-2xl text-lg leading-8 sm:text-xl">{data.description}</p>
        </header>

        <section className="grid border-x border-b bg-[var(--paper-soft)] editorial-rule sm:grid-cols-2">
          <div className="border-b p-6 sm:border-b-0 sm:border-r sm:p-10" style={{ borderColor: "var(--line)" }}>
            <p className="eyebrow">Cash position</p>
            <p className="display-type financial metric-value mt-3">{formatCash(data.cash)}</p>
          </div>
          <div className="p-6 sm:p-10">
            <p className="eyebrow">Reputation index</p>
            <p className="display-type financial metric-value mt-3">{data.reputation}</p>
          </div>
        </section>

        <section className="border-x px-6 py-14 editorial-rule lg:grid lg:grid-cols-[0.4fr_1fr] lg:gap-16 lg:px-10">
          <h2 className="display-type section-title">On the record.</h2>
          <div className="mt-8 border-y-2 editorial-rule py-14 text-center lg:mt-0">
            <p className="text-lg font-bold">Nothing on the record—yet.</p>
            <p className="body-muted mt-2 text-sm">The next decision will appear after a market tick.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
