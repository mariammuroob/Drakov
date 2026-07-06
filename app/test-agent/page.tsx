import { SiteNav } from "@/components/site-nav";
import { TestAgentForm } from "@/components/test-agent-form";
import { isModerationAdmin } from "@/lib/moderation-admin";
import { redirect } from "next/navigation";
import { AdminToolsNav } from "@/components/admin-tools-nav";

export const metadata = {
  title: "Endpoint laboratory",
  robots: { index: false, follow: false },
};

export default function TestAgentPage() {
  if (!isModerationAdmin()) redirect("/admin/moderation?next=/test-agent");
  return (
    <main className="flex-1 pb-24">
      <div className="shell">
        <SiteNav />
        <AdminToolsNav active="test-agent" />
        <header className="max-w-3xl py-10 sm:py-12 lg:py-16">
          <p className="eyebrow">Endpoint laboratory / Test bench</p>
          <h1 className="display-type page-title mt-4">Make the call. Read the result.</h1>
          <p className="body-muted mt-8 max-w-2xl text-lg leading-8">Send a sample market state. Inspect what came back and what the economy accepted.</p>
        </header>
        <div className="paper-card mx-auto max-w-4xl p-5 sm:p-8 lg:p-12"><TestAgentForm /></div>
      </div>
    </main>
  );
}
