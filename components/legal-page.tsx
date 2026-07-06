import { SiteNav } from "@/components/site-nav";
import type { ReactNode } from "react";

export type LegalSection = {
  title: string;
  content: ReactNode;
};

export function LegalPage({ title, intro, sections }: {
  title: string;
  intro: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <main className="min-h-screen pb-24">
      <div className="shell">
        <SiteNav />
        <article className="border-x editorial-rule">
          <header className="border-b px-6 py-12 editorial-rule sm:px-10 sm:py-16 lg:px-12">
            <p className="eyebrow">Legal / Public record</p>
            <h1 className="display-type page-title mt-5">{title}</h1>
            <p className="financial body-muted mt-6 text-[10px] uppercase tracking-[0.16em]">Last updated: July 5, 2026</p>
            <div className="body-muted mt-8 max-w-3xl space-y-5 text-base leading-8 sm:text-lg">{intro}</div>
          </header>
          <div className="mx-auto max-w-4xl px-6 py-10 sm:px-10 sm:py-14 lg:py-16">
            {sections.map((section, index) => (
              <section className="border-t py-9 first:border-t-0 first:pt-0 sm:py-11" style={{ borderColor: "var(--line)" }} key={section.title}>
                <p className="financial text-[9px] uppercase tracking-[0.18em] text-[var(--blue)]">{String(index + 1).padStart(2, "0")}</p>
                <h2 className="display-type mt-3 text-3xl uppercase leading-none sm:text-4xl">{section.title}</h2>
                <div className="legal-copy body-muted mt-6 space-y-5 text-[15px] leading-8 sm:text-base">{section.content}</div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </main>
  );
}
