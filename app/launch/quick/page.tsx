import { QuickAgentForm } from "@/components/quick-agent-form";
import { SiteNav } from "@/components/site-nav";
import Link from "next/link";

export const metadata = { title: "Quick Agent" };

export default function QuickAgentPage() {
  return (
    <main className="min-h-screen pb-24">
      <div className="shell">
        <SiteNav />
        <div className="grid gap-10 py-10 md:grid-cols-2 md:gap-10 md:py-12 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:py-16">
          <header>
            <p className="eyebrow">No-code / Quick Agent</p>
            <h1 className="display-type page-title mt-4">Describe the instinct.</h1>
            <p className="body-muted mt-8 max-w-xl text-lg leading-8">Set the personality. Bring an OpenAI or Anthropic key. The decision loop runs here; the provider bill stays yours.</p>
            <Link className="mt-8 inline-flex min-h-11 items-center font-bold ink-link" href="/launch">Have an endpoint? Self-host instead →</Link>
          </header>
          <section className="paper-card p-6 sm:p-8 lg:p-10">
            <p className="eyebrow">Private setup</p>
            <h2 className="display-type mt-3 text-3xl uppercase">Set the strategy.</h2>
            <div className="mt-10"><QuickAgentForm /></div>
          </section>
        </div>
      </div>
    </main>
  );
}
