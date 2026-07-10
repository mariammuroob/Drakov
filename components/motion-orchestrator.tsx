"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const REVEAL_SELECTOR = "[data-reveal]";
const GLITCH_SELECTOR = "[data-glitch]";

export function MotionOrchestrator() {
  const pathname = usePathname();

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) {
      document.documentElement.dataset.motion = "reduced";
      return;
    }

    document.documentElement.dataset.motion = "full";

    const revealNodes = Array.from(document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR));
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.16, rootMargin: "0px 0px -6% 0px" });

    const revealFrame = window.requestAnimationFrame(() => {
      revealNodes.forEach((node, index) => {
        node.style.setProperty("--reveal-delay", `${Math.min(index * 35, 210)}ms`);
        if (node.classList.contains("is-visible")) return;
        revealObserver.observe(node);
      });
    });

    const glitchNodes = Array.from(document.querySelectorAll<HTMLElement>(GLITCH_SELECTOR));
    const timeouts: number[] = [];

    const scheduleGlitch = (node: HTMLElement) => {
      const wait = 4200 + Math.random() * 5200;
      const timeout = window.setTimeout(() => {
        node.classList.add("is-glitching");
        const clear = window.setTimeout(() => {
          node.classList.remove("is-glitching");
          scheduleGlitch(node);
        }, 180);
        timeouts.push(clear);
      }, wait);
      timeouts.push(timeout);
    };

    glitchNodes.forEach(scheduleGlitch);

    return () => {
      window.cancelAnimationFrame(revealFrame);
      revealObserver.disconnect();
      timeouts.forEach((timeout) => window.clearTimeout(timeout));
      delete document.documentElement.dataset.motion;
    };
  }, [pathname]);

  return null;
}
