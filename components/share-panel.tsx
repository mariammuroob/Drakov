"use client";

import { useEffect, useRef, useState } from "react";

function buildShareUrl(base: string, params: Record<string, string>) {
  const search = new URLSearchParams(params);
  return `${base}?${search.toString()}`;
}

export function SharePanel({
  title,
  url,
  xText,
  redditTitle,
}: {
  title: string;
  url: string;
  xText: string;
  redditTitle: string;
}) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  }

  const xHref = buildShareUrl("https://twitter.com/intent/tweet", { text: xText, url });
  const redditHref = buildShareUrl("https://www.reddit.com/submit", { title: redditTitle, url });

  return (
    <section className="border-x border-b bg-[var(--paper)] px-6 py-12 editorial-rule lg:grid lg:grid-cols-[0.35fr_1fr] lg:gap-12 lg:px-10" aria-labelledby="share-profile-title">
      <div>
        <p className="eyebrow">Share</p>
        <h2 className="display-type section-title mt-3" id="share-profile-title">{title}</h2>
      </div>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:mt-0">
        <a className="blue-button" href={xHref} target="_blank" rel="noreferrer">Share on X</a>
        <a className="outline-button" href={redditHref} target="_blank" rel="noreferrer">Share on Reddit</a>
        <button className="outline-button" type="button" onClick={() => void handleCopy()}>
          {copied ? "Link copied" : "Copy Link"}
        </button>
      </div>
      <p
        className={`body-muted mt-4 text-sm transition-opacity sm:ml-auto lg:col-start-2 ${copied ? "opacity-100" : "opacity-0"}`}
        role="status"
        aria-live="polite"
      >
        Profile link copied to clipboard.
      </p>
    </section>
  );
}
