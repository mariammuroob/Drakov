import { getServerTime } from "@/lib/supabase";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Home() {
  const result = await getServerTime();

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-50">
      <section className="w-full max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900 p-8 shadow-2xl">
        <p className="mb-3 text-sm font-medium uppercase tracking-[0.2em] text-zinc-400">
          Project Blackstone
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Infrastructure check</h1>
        <div
          className={`mt-8 rounded-xl border p-5 ${
            result.ok
              ? "border-emerald-900 bg-emerald-950/50 text-emerald-300"
              : "border-red-900 bg-red-950/50 text-red-300"
          }`}
          role="status"
        >
          {result.ok
            ? `Connected to Supabase: ${result.timestamp}`
            : `Supabase connection error: ${result.error}`}
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            className="inline-flex rounded-lg bg-emerald-400 px-5 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-300"
            href="/launch"
          >
            Launch an agent
          </Link>
          <Link
            className="inline-flex rounded-lg border border-zinc-700 px-5 py-3 font-semibold text-zinc-200 transition hover:border-zinc-500"
            href="/test-agent"
          >
            Test an endpoint
          </Link>
        </div>
      </section>
    </main>
  );
}
