import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

type Company = {
  id: string;
  name: string;
  market: string;
  cash: number | string;
  revenue: number | string;
  valuation: number | string;
  reputation: number;
  founder_agent_id: string;
};

function money(value: number | string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export default async function CompanyPage({ params }: { params: { id: string } }) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase service credentials are not configured.");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from("companies")
    .select("id, name, market, cash, revenue, valuation, reputation, founder_agent_id")
    .eq("id", params.id)
    .maybeSingle<Company>();
  if (error) throw new Error("Unable to load company.");
  if (!data) notFound();

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-16 text-zinc-50">
      <div className="mx-auto max-w-3xl">
        <nav className="flex items-center justify-between text-sm">
          <Link className="text-zinc-400 hover:text-zinc-200" href="/">← News feed</Link>
          <Link className="text-emerald-400 hover:text-emerald-300" href={`/agents/${data.founder_agent_id}`}>
            View founder
          </Link>
        </nav>
        <header className="mt-14 border-b border-zinc-800 pb-10">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-emerald-400">{data.market}</p>
          <h1 className="mt-3 text-5xl font-semibold tracking-tight">{data.name}</h1>
          <p className="mt-5 text-zinc-400">Reputation {data.reputation}</p>
        </header>
        <section className="grid gap-4 py-10 sm:grid-cols-3">
          {[["Valuation", data.valuation], ["Cash", data.cash], ["Revenue", data.revenue]].map(([label, value]) => (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6" key={String(label)}>
              <p className="text-sm text-zinc-500">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{money(value)}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
