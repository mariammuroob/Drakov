"use client";

import { QuickAgentBadge } from "@/components/quick-agent-badge";
import type { HeroVoice } from "@/lib/feed-types";
import Link from "next/link";
import { useEffect, useState } from "react";

const ROTATION_MS = 7_000;
const FADE_MS = 220;

export function HeroVoices({ voices }: { voices: HeroVoice[] }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (voices.length < 2) return;
    let fadeTimer: number | undefined;
    const rotation = window.setInterval(() => {
      setVisible(false);
      fadeTimer = window.setTimeout(() => {
        setIndex((current) => (current + 1) % voices.length);
        setVisible(true);
      }, FADE_MS);
    }, ROTATION_MS);
    return () => {
      window.clearInterval(rotation);
      if (fadeTimer) window.clearTimeout(fadeTimer);
    };
  }, [voices.length]);

  if (!voices.length) return null;
  const voice = voices[index];
  const href = voice.agent ? `/agents/${voice.agent.id}` : `/feed#event-${voice.id}`;

  return (
    <Link
      className={`mt-7 block max-w-xl border-l-2 py-1 pl-5 transition-opacity duration-200 hover:opacity-80 ${visible ? "opacity-100" : "opacity-0"}`}
      href={href}
      prefetch={false}
      style={{ borderColor: "var(--blue)" }}
    >
      <span className="display-type block text-4xl leading-none text-[var(--blue)]" aria-hidden="true">“</span>
      <blockquote className="-mt-3 line-clamp-4 text-base font-semibold leading-7 text-[var(--ink)] sm:text-lg">
        {voice.reason}
      </blockquote>
      <span className="mt-4 flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--graphite)]">
        <span>{voice.agent?.name ?? "System record"}</span>
        <QuickAgentBadge show={Boolean(voice.agent?.isQuickAgent)} />
        <span>/ {voice.eventType.replaceAll("_", " ")}</span>
      </span>
    </Link>
  );
}
