"use client";

import { useEffect, useRef } from "react";

/**
 * Immersive 3D environment behind the whole dashboard — a brand-colored
 * starfield you fly through, like the cockpit of a game.
 *
 *   - Perspective-projected star streaks continuously warp toward the camera.
 *   - The CAMERA follows the mouse (look around the 3D space) with eased motion.
 *   - SCROLLING punches the warp speed (you feel like you're accelerating
 *     forward through the scene, not scrolling a page), then eases back.
 *   - Edge-weighted via a CSS mask so the center (where content sits) stays
 *     calm and readable; corners feel alive.
 *   - Theme + tenant aware (reads --primary), DPR-crisp, pauses when the tab is
 *     hidden, and renders NOTHING under `prefers-reduced-motion`.
 *   - CSP-safe: same-origin canvas 2D, no eval/external.
 */
export function FxScene() {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const hsl =
      getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() ||
      "159 100% 45%";

    const FAR = 1400;
    const FOCAL = 300;
    let W = 0;
    let H = 0;
    let dpr = 1;
    let cx = 0;
    let cy = 0;

    type Star = { x: number; y: number; z: number; pz: number };
    let stars: Star[] = [];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const mkStar = (z?: number): Star => {
      const zz = z ?? rnd(1, FAR);
      return { x: rnd(-W, W), y: rnd(-H, H), z: zz, pz: zz };
    };
    const seed = () => {
      const n = Math.min(260, Math.max(70, Math.round((W * H) / 7000)));
      stars = Array.from({ length: n }, () => mkStar());
    };

    // camera: mx/my = mouse target (-1..1), ox/oy = eased offset, speed = warp
    const cam = { mx: 0, my: 0, ox: 0, oy: 0, speed: 1.8, tSpeed: 1.8 };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = W / 2;
      cy = H / 2;
      seed();
    };

    let raf = 0;
    let running = true;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!running) return;
      cam.ox += (cam.mx - cam.ox) * 0.05;
      cam.oy += (cam.my - cam.oy) * 0.05;
      cam.speed += (cam.tSpeed - cam.speed) * 0.06;

      ctx.clearRect(0, 0, W, H);
      ctx.lineCap = "round";
      const shiftX = cam.ox * 60;
      const shiftY = cam.oy * 60;
      for (const s of stars) {
        s.pz = s.z;
        s.z -= cam.speed;
        if (s.z < 1) {
          Object.assign(s, mkStar(FAR));
          continue;
        }
        const k = FOCAL / s.z;
        const pk = FOCAL / s.pz;
        const sx = cx + (s.x + shiftX) * k;
        const sy = cy + (s.y + shiftY) * k;
        if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) continue;
        const px = cx + (s.x + shiftX) * pk;
        const py = cy + (s.y + shiftY) * pk;
        const depth = 1 - s.z / FAR; // 0 far → 1 near
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(sx, sy);
        ctx.strokeStyle = `hsl(${hsl} / ${Math.min(0.85, depth * 1.05).toFixed(3)})`;
        ctx.lineWidth = Math.max(0.4, depth * 2.4);
        ctx.stroke();
      }
    };

    const onMove = (e: MouseEvent) => {
      cam.mx = (e.clientX / window.innerWidth - 0.5) * 2;
      cam.my = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    let decay: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      cam.tSpeed = 13; // warp punch on scroll
      clearTimeout(decay);
      decay = setTimeout(() => {
        cam.tSpeed = 1.8;
      }, 240);
    };
    const onVis = () => {
      running = !document.hidden;
    };
    let rt: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(rt);
      rt = setTimeout(resize, 150);
    };

    resize();
    raf = requestAnimationFrame(frame);
    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(decay);
      clearTimeout(rt);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("scroll", onScroll, { capture: true });
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={ref} className="fx-scene-canvas" aria-hidden />;
}
