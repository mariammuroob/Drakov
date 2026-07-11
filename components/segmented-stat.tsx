"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";

type SegmentName = "a" | "b" | "c" | "d" | "e" | "f" | "g";
type Tone = "blue" | "amber" | "crimson";

const SEGMENTS: SegmentName[] = ["a", "b", "c", "d", "e", "f", "g"];
const DIGIT_MASKS: Record<string, ReadonlySet<SegmentName>> = {
  "0": new Set(["a", "b", "c", "d", "e", "f"]),
  "1": new Set(["b", "c"]),
  "2": new Set(["a", "b", "d", "e", "g"]),
  "3": new Set(["a", "b", "c", "d", "g"]),
  "4": new Set(["b", "c", "f", "g"]),
  "5": new Set(["a", "c", "d", "f", "g"]),
  "6": new Set(["a", "c", "d", "e", "f", "g"]),
  "7": new Set(["a", "b", "c"]),
  "8": new Set(SEGMENTS),
  "9": new Set(["a", "b", "c", "d", "f", "g"]),
};

function zeroShape(value: string) {
  return value.replace(/\d/g, "0");
}

function alignToTarget(previous: string, target: string) {
  if (previous.length === target.length) return previous;
  const previousDigits = previous.match(/\d/g) ?? [];
  let digitIndex = previousDigits.length - 1;
  return [...target].reverse().map((token) => {
    if (!/\d/.test(token)) return token;
    const digit = previousDigits[digitIndex] ?? "0";
    digitIndex -= 1;
    return digit;
  }).reverse().join("");
}

function formatValue(value: number, format: "number" | "currency", signed: boolean, minimumDigits: number) {
  return new Intl.NumberFormat("en-US", format === "currency"
    ? { style: "currency", currency: "USD", maximumFractionDigits: 0, minimumIntegerDigits: minimumDigits, signDisplay: signed ? "always" : "auto" }
    : { maximumFractionDigits: 0, minimumIntegerDigits: minimumDigits, signDisplay: signed ? "always" : "auto" }).format(value);
}

export function SegmentedStat({
  value,
  format = "number",
  tone = "blue",
  size = "default",
  signed = false,
  minimumDigits = 1,
  live = false,
  label,
}: {
  value: number;
  format?: "number" | "currency";
  tone?: Tone;
  size?: "default" | "compact";
  signed?: boolean;
  minimumDigits?: number;
  live?: boolean;
  label: string;
}) {
  const formatted = useMemo(() => formatValue(value, format, signed, minimumDigits), [format, minimumDigits, signed, value]);
  const [displayed, setDisplayed] = useState(() => zeroShape(formatted));

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setDisplayed(formatted);
      return;
    }

    let secondFrame = 0;
    setDisplayed((current) => alignToTarget(current, formatted));
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => setDisplayed(formatted));
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [formatted]);

  return (
    <span className={`segmented-stat segmented-stat-${tone} segmented-stat-${size}`} role={live ? "status" : undefined} aria-live={live ? "polite" : undefined} aria-label={`${label}: ${formatted}`}>
      <span aria-hidden="true" className="segmented-stat-visual">
        {[...displayed].map((token, index) => {
          const active = DIGIT_MASKS[token];
          if (!active) return <span className="segmented-symbol" key={`${index}-${token}`}>{token}</span>;
          return (
            <span className="segmented-digit" key={index} style={{ "--digit-delay": `${index * 22}ms` } as CSSProperties}>
              {SEGMENTS.map((segment) => <span className={`digit-segment segment-${segment}`} data-lit={active.has(segment) || undefined} key={segment} />)}
            </span>
          );
        })}
      </span>
    </span>
  );
}
