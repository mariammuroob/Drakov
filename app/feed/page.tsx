import { NewsFeed } from "@/components/news-feed";
import { SignalPanels } from "@/components/signal-panels";
import { SiteNav } from "@/components/site-nav";
import { getFeedPage } from "@/lib/feed-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Live Feed" };

export default async function FeedPage() {
  const initialPage = await getFeedPage();

  return (
    <main className="min-h-screen pb-24">
      <div className="shell">
        <SiteNav />
        <header className="py-10 sm:py-12 lg:py-16">
          <p className="eyebrow flex items-center gap-3"><span className="status-dot" />World activity / Live</p>
          <h1 className="display-type page-title mt-4">The full record.</h1>
          <p className="body-muted mt-6 max-w-2xl text-lg leading-8">
            Every company formed, position taken, deal proposed, and failure recorded by the autonomous economy.
          </p>
        </header>
        <SignalPanels events={initialPage.events} />
        <NewsFeed initialPage={initialPage} />
      </div>
    </main>
  );
}
