"use client";

import { useEffect, useRef } from "react";

/**
 * Immersive branded backdrop for the auth / sign-in screens — the first thing a
 * user sees. A soft brand-color aurora plus a live particle network (dots that
 * connect to nearby dots and reach toward the cursor), drawn on a 2D canvas.
 *
 *   - Reads the live `--primary` token, so it matches light/dark + any tenant
 *     theme (default BolivAI green pre-login).
 *   - Honors `prefers-reduced-motion` (renders the static aurora only).
 *   - DPR-aware for crisp dots; capped particle count; debounced resize.
 *   - CSP-safe: same-origin, canvas 2D, no eval/external.
 */
export function AuthBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Resolve the brand color from the CSS token: "159 100% 45%".
    const hsl = getComputedStyle(document.documentElement)
      .getPropertyValue("--primary")
      .trim();
    const stroke = (a: number) => `hsl(${hsl} / ${a})`;

    let W = 0;
    let H = 0;
    let dpr = 1;
    type P = { x: number; y: number; vx: number; vy: number };
    let parts: P[] = [];
    const mouse = { x: -9999, y: -9999 };

    const seed = () => {
      const count = Math.min(70, Math.round((W * H) / 17000));
      parts = Array.from({ length: count }, (_, i) => ({
        // deterministic-ish spread (no Math.random dependency on first paint)
        x: ((i * 97) % 100) / 100 * W,
        y: ((i * 53) % 100) / 100 * H,
        vx: (((i * 31) % 100) / 100 - 0.5) * 0.35,
        vy: (((i * 17) % 100) / 100 - 0.5) * 0.35,
      }));
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
    };

    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > W) p.vx *= -1;
        if (p.y < 0 || p.y > H) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
        ctx.fillStyle = stroke(0.6);
        ctx.fill();
      }
      for (let i = 0; i < parts.length; i++) {
        for (let j = i + 1; j < parts.length; j++) {
          const a = parts[i];
          const b = parts[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 16900) {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.strokeStyle = stroke(0.16 * (1 - d2 / 16900));
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
        // reach toward the cursor
        const a = parts[i];
        const mdx = a.x - mouse.x;
        const mdy = a.y - mouse.y;
        const md2 = mdx * mdx + mdy * mdy;
        if (md2 < 30000) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(mouse.x, mouse.y);
          ctx.strokeStyle = stroke(0.28 * (1 - md2 / 30000));
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
      raf = requestAnimationFrame(tick);
    };

    const onMouse = (e: MouseEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    const onLeave = () => {
      mouse.x = -9999;
      mouse.y = -9999;
    };

    let resizeT: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(resizeT);
      resizeT = setTimeout(resize, 150);
    };

    resize();
    raf = requestAnimationFrame(tick);
    window.addEventListener("resize", onResize);
    window.addEventListener("mousemove", onMouse, { passive: true });
    window.addEventListener("mouseout", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(resizeT);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("mouseout", onLeave);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* brand aurora — always present, even with reduced motion / no JS */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 22%, hsl(var(--primary) / 0.14), transparent 70%), radial-gradient(ellipse 50% 50% at 85% 95%, hsl(var(--primary) / 0.08), transparent 65%)",
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
