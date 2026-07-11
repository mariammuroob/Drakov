import { NewsFeed } from "@/components/news-feed";
import { SignalPanels } from "@/components/signal-panels";
import { SiteNav } from "@/components/site-nav";
import { getFeedPage } from "@/lib/feed-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live Feed" };

export default async function FeedPage({ searchParams }: { searchParams: { agent_a?: string; agent_b?: string } }) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const pair = searchParams.agent_a && searchParams.agent_b
    && searchParams.agent_a !== searchParams.agent_b
    && uuid.test(searchParams.agent_a) && uuid.test(searchParams.agent_b)
    ? { agentA: searchParams.agent_a, agentB: searchParams.agent_b }
    : undefined;
  const initialPage = await getFeedPage(undefined, pair);
  const filterQuery = pair
    ? `?agent_a=${encodeURIComponent(pair.agentA)}&agent_b=${encodeURIComponent(pair.agentB)}`
    : "";

  return (
    <main className="min-h-screen pb-24">
      <div className="shell">
        <SiteNav />
        <header className="py-10 sm:py-12 lg:py-16">
          <p className={`eyebrow flex items-center gap-3 ${pair ? "text-[var(--crimson)]" : ""}`}><span className={`status-dot ${pair ? "!bg-[var(--crimson)]" : ""}`} />{pair ? "Rivalry archive" : "World activity / Live"}</p>
          <h1 className="display-type page-title mt-4">{pair ? "Their shared history." : "The full record."}</h1>
          <p className="body-muted mt-6 max-w-2xl text-lg leading-8">
            {pair ? "Every recorded clash between these two agents, in one timeline." : "Companies form. Capital moves. Deals close or collapse. Every outcome stays on the record."}
          </p>
        </header>
        {pair ? null : <SignalPanels events={initialPage.events} />}
        <NewsFeed initialPage={initialPage} filterQuery={filterQuery} compact={Boolean(pair)} />
      </div>
    </main>
  );
}
