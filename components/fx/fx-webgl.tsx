"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { FxScene } from "./fx-scene";

/**
 * Backdrop 3D layer selector.
 *   - reduced-motion → nothing (the CSS aurora/grid carries the depth).
 *   - no WebGL → the lightweight Canvas-2D starfield (FxScene).
 *   - otherwise → the real WebGL scene, lazy-loaded client-only so Three.js
 *     never ships in the server bundle and never blocks first paint.
 */
const FxWebglScene = dynamic(
  () => import("./fx-webgl-scene").then((m) => m.FxWebglScene),
  { ssr: false },
);

export function FxWebgl() {
  const [mode, setMode] = useState<"pending" | "webgl" | "2d" | "off">("pending");

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMode("off"); // CSS aurora/grid carry the depth, no motion
      return;
    }
    let ok = false;
    try {
      const c = document.createElement("canvas");
      ok = !!(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      ok = false;
    }
    setMode(ok ? "webgl" : "2d");
  }, []);

  if (mode === "webgl") return <FxWebglScene />;
  if (mode === "2d") return <FxScene />;
  return null; // pending / off
}
