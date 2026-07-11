"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const REVEAL_SELECTOR = "[data-reveal]";
const GLITCH_SELECTOR = "[data-glitch]";
const COLOR_SECTION_SELECTOR = "main header, main section";

const COLOR_STOPS = [
  { background: [12, 10, 7], accent: [200, 163, 122] },
  { background: [17, 18, 16], accent: [168, 134, 99] },
] as const;

function mixedColor(from: readonly number[], to: readonly number[], progress: number) {
  const values = from.map((channel, index) => Math.round(channel + (to[index] - channel) * progress));
  return `rgb(${values.join(" ")})`;
}

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

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sections = Array.from(document.querySelectorAll<HTMLElement>(COLOR_SECTION_SELECTOR))
      .filter((section) => !section.parentElement?.closest("header, section"));
    let colorFrame = 0;

    const applyStablePalette = () => {
      root.style.setProperty("--paper", "#0c0a07");
      root.style.setProperty("--blue", "#c8a37a");
      root.style.setProperty("--accent", "#c8a37a");
      root.style.setProperty("--amber", "#c8a37a");
      root.style.setProperty("--crimson", "#a88663");
      root.style.setProperty("--danger", "#a88663");
    };

    const updateColors = () => {
      colorFrame = 0;
      if (media.matches || sections.length < 2) {
        applyStablePalette();
        return;
      }

      const focus = window.scrollY + window.innerHeight * 0.5;
      const centers = sections.map((section) => {
        const bounds = section.getBoundingClientRect();
        return bounds.top + window.scrollY + bounds.height * 0.5;
      });
      const followingSection = centers.findIndex((center) => center > focus);
      let sectionIndex = followingSection === -1 ? centers.length - 1 : followingSection - 1;
      sectionIndex = Math.max(0, Math.min(sectionIndex, centers.length - 1));
      const nextIndex = Math.min(sectionIndex + 1, centers.length - 1);
      const distance = Math.max(1, centers[nextIndex] - centers[sectionIndex]);
      const progress = nextIndex === sectionIndex
        ? 0
        : Math.max(0, Math.min(1, (focus - centers[sectionIndex]) / distance));
      const from = COLOR_STOPS[sectionIndex % COLOR_STOPS.length];
      const to = COLOR_STOPS[nextIndex % COLOR_STOPS.length];
      const background = mixedColor(from.background, to.background, progress);
      const accent = mixedColor(from.accent, to.accent, progress);

      root.style.setProperty("--paper", background);
      root.style.setProperty("--blue", accent);
      root.style.setProperty("--accent", accent);
      root.style.setProperty("--amber", accent);
      root.style.setProperty("--crimson", "#a88663");
      root.style.setProperty("--danger", "#a88663");
    };

    const scheduleColorUpdate = () => {
      if (colorFrame) return;
      colorFrame = window.requestAnimationFrame(updateColors);
    };

    const handleMotionPreference = () => {
      if (media.matches) applyStablePalette();
      else scheduleColorUpdate();
    };

    scheduleColorUpdate();
    window.addEventListener("scroll", scheduleColorUpdate, { passive: true });
    window.addEventListener("resize", scheduleColorUpdate);
    media.addEventListener("change", handleMotionPreference);

    return () => {
      window.cancelAnimationFrame(colorFrame);
      window.removeEventListener("scroll", scheduleColorUpdate);
      window.removeEventListener("resize", scheduleColorUpdate);
      media.removeEventListener("change", handleMotionPreference);
      applyStablePalette();
    };
  }, [pathname]);

  return null;
}
