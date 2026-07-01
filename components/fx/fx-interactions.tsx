"use client";

import { useEffect } from "react";

/**
 * Site-wide "interactive glass" engine for the dashboard.
 *
 * Adds premium effects without touching any page's markup:
 *   1. a brand-color spotlight that follows the cursor on EVERY `.card-pro`
 *      (i.e. every shadcn <Card>) — CSS vars --fx-mx/--fx-my feed the
 *      radial-gradient defined in globals.css,
 *   2. a subtle 3D tilt toward the cursor on showcase `.panel-pro` cards only
 *      (inline transform) — kept off regular/data cards on purpose,
 *   3. scroll-reveal — cards rise & fade in as they enter the viewport
 *      (staggered), and re-scan on client navigation via a MutationObserver,
 *   4. parallax — the backdrop aurora drifts against the scroll for depth.
 *
 * Implementation notes:
 *   - Pure event delegation on `document` (one listener), so it works for cards
 *     that mount/unmount on client navigation — no per-card wiring, no re-scan.
 *   - rAF-throttled; reads layout once per frame.
 *   - Honors `prefers-reduced-motion` (drops the tilt, keeps the glow) and only
 *     runs on a fine pointer (no jank on touch).
 *   - Mounts once in the shell layout and renders nothing.
 */
export function FxInteractions() {
  useEffect(() => {
    const fine = window.matchMedia("(pointer:fine)").matches;
    if (!fine) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let pending: { card: HTMLElement; x: number; y: number } | null = null;
    let current: HTMLElement | null = null;

    const reset = (card: HTMLElement) => {
      card.style.removeProperty("--fx-mx");
      card.style.removeProperty("--fx-my");
      card.style.transform = "";
    };

    const apply = () => {
      raf = 0;
      if (!pending) return;
      const { card, x, y } = pending;
      const r = card.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const px = (x - r.left) / r.width;
      const py = (y - r.top) / r.height;
      card.style.setProperty("--fx-mx", (px * 100).toFixed(2) + "%");
      card.style.setProperty("--fx-my", (py * 100).toFixed(2) + "%");
      // 3D tilt: showcase cards only (.panel-pro), and never with reduced motion.
      if (!reduce && card.classList.contains("panel-pro")) {
        const ry = (px - 0.5) * 6; // ≤3° each way — premium, not gimmicky
        const rx = -(py - 0.5) * 6;
        card.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(-3px)`;
      }
    };

    const onMove = (e: PointerEvent) => {
      const target = e.target as Element | null;
      const card = (target?.closest?.(".card-pro") as HTMLElement | null) ?? null;
      if (card !== current) {
        if (current) reset(current);
        current = card;
      }
      if (!card) return;
      pending = { card, x: e.clientX, y: e.clientY };
      if (!raf) raf = requestAnimationFrame(apply);
    };

    const onLeave = () => {
      if (current) {
        reset(current);
        current = null;
      }
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);

    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      if (raf) cancelAnimationFrame(raf);
      if (current) reset(current);
    };
  }, []);

  // ── Scroll-reveal + parallax (own lifecycle; skipped under reduced motion).
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Reveal: stagger each batch, then stop watching the element.
    const io = new IntersectionObserver(
      (entries) => {
        let i = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          el.style.transitionDelay = Math.min(i * 55, 280) + "ms";
          el.classList.add("fx-in");
          io.unobserve(el);
          i++;
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -5% 0px" },
    );

    const SEL = ".card-pro,[data-fx-reveal]";

    // Backstop: reveal any card still hidden so content never stays invisible
    // waiting for a scroll. The original one-shot 1800ms timer ran ONLY at mount,
    // so on client navigation a below-the-fold card (e.g. the Leads table) stayed
    // at opacity:0 until scrolled into view. Re-arm it on every scan that adds
    // cards; 400ms is imperceptible and the IO still plays the rise for cards it
    // reveals first.
    let safety = 0;
    const revealAll = () => {
      safety = 0;
      document.querySelectorAll(".fx-reveal:not(.fx-in)").forEach((n) => n.classList.add("fx-in"));
    };

    const scan = () => {
      let added = 0;
      document.querySelectorAll(SEL + ":not([data-fx-r])").forEach((n) => {
        const el = n as HTMLElement;
        el.setAttribute("data-fx-r", "1");
        el.classList.add("fx-reveal");
        io.observe(el);
        added++;
      });
      if (added > 0 && !safety) safety = window.setTimeout(revealAll, 400);
    };
    scan();

    // Re-scan when client navigation swaps page content inside <main>.
    let scanRaf = 0;
    const mo = new MutationObserver(() => {
      if (scanRaf) return;
      scanRaf = requestAnimationFrame(() => {
        scanRaf = 0;
        scan();
      });
    });
    const main = document.querySelector("main");
    if (main) mo.observe(main, { childList: true, subtree: true });

    // Parallax: drift the backdrop aurora against the scroll position.
    const aurora = document.querySelector(".fx-aurora") as HTMLElement | null;
    let pRaf = 0;
    let lastY = 0;
    const onScroll = (e: Event) => {
      const t = e.target as HTMLElement | null;
      lastY = t && typeof t.scrollTop === "number" ? t.scrollTop : 0;
      if (!aurora || pRaf) return;
      pRaf = requestAnimationFrame(() => {
        pRaf = 0;
        aurora.style.transform = `translate3d(0, ${(lastY * 0.12).toFixed(1)}px, 0)`;
      });
    };
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });

    return () => {
      io.disconnect();
      mo.disconnect();
      window.clearTimeout(safety);
      if (scanRaf) cancelAnimationFrame(scanRaf);
      if (pRaf) cancelAnimationFrame(pRaf);
      document.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, []);

  return null;
}
