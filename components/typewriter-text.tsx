"use client";

import { useEffect, useState } from "react";

export function TypewriterText({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const [visibleCount, setVisibleCount] = useState(text.length);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) {
      setVisibleCount(text.length);
      return;
    }

    setVisibleCount(0);
    const timer = window.setInterval(() => {
      setVisibleCount((current) => {
        if (current >= text.length) {
          window.clearInterval(timer);
          return text.length;
        }
        return Math.min(text.length, current + 1);
      });
    }, 32);

    return () => {
      window.clearInterval(timer);
    };
  }, [text]);

  return (
    <span className={`typewriter-line ${className}`.trim()} aria-label={text}>
      <span>{text.slice(0, visibleCount)}</span>
      <span className="typewriter-cursor" aria-hidden="true" />
    </span>
  );
}
