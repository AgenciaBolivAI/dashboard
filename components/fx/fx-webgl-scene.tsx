"use client";

import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Real WebGL 3D environment (React Three Fiber) — a brand-colored glowing
 * starfield you fly through. GPU-rendered points with additive "bloom" sprites,
 * a mouse-driven camera (look around the 3D space) and a scroll-driven warp
 * (you accelerate forward through the scene). Loaded client-only (ssr:false)
 * from fx-webgl.tsx, which falls back to the Canvas-2D scene when WebGL or
 * motion isn't available.
 */

const SPREAD = 90;
const FAR = 230;
const BASE_SPEED = 12;
const BOOST_SPEED = 95;

/** Read the live --primary token (per-tenant) off the shell backdrop → Color. */
function readBrandColor(): THREE.Color {
  const c = new THREE.Color("#00e5a0");
  const el = document.querySelector(".app-backdrop") ?? document.documentElement;
  const raw = getComputedStyle(el).getPropertyValue("--primary").trim();
  const m = raw.match(/([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/);
  if (m) {
    c.setHSL(
      parseFloat(m[1]) / 360,
      parseFloat(m[2]) / 100,
      Math.min(0.62, parseFloat(m[3]) / 100 + 0.08),
    );
  }
  return c;
}

/** Soft radial sprite → glowing orbs under additive blending (bloom-like). */
function makeSprite(): THREE.Texture {
  const s = 64;
  const cv = document.createElement("canvas");
  cv.width = cv.height = s;
  const ctx = cv.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.3, "rgba(255,255,255,0.85)");
  g.addColorStop(0.55, "rgba(255,255,255,0.3)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.needsUpdate = true;
  return tex;
}

function Starfield({
  count,
  size,
  opacity,
  color,
  sprite,
  speed,
}: {
  count: number;
  size: number;
  opacity: number;
  color: THREE.Color;
  sprite: THREE.Texture;
  speed: MutableRefObject<number>;
}) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const a = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      a[i * 3] = (Math.random() - 0.5) * SPREAD * 2;
      a[i * 3 + 1] = (Math.random() - 0.5) * SPREAD * 2;
      a[i * 3 + 2] = -Math.random() * FAR;
    }
    return a;
  }, [count]);

  useFrame((_, delta) => {
    const pts = ref.current;
    if (!pts) return;
    const arr = pts.geometry.attributes.position.array as Float32Array;
    const sp = speed.current * Math.min(delta, 0.05);
    for (let i = 0; i < count; i++) {
      let z = arr[i * 3 + 2] + sp;
      if (z > 3) {
        z = -FAR;
        arr[i * 3] = (Math.random() - 0.5) * SPREAD * 2;
        arr[i * 3 + 1] = (Math.random() - 0.5) * SPREAD * 2;
      }
      arr[i * 3 + 2] = z;
    }
    pts.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={sprite}
        color={color}
        size={size}
        sizeAttenuation
        transparent
        opacity={opacity}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function CameraRig({ mouse }: { mouse: MutableRefObject<{ x: number; y: number }> }) {
  useFrame(({ camera }) => {
    camera.position.x += (mouse.current.x * 16 - camera.position.x) * 0.045;
    camera.position.y += (-mouse.current.y * 10 - camera.position.y) * 0.045;
    camera.lookAt(0, 0, -50);
  });
  return null;
}

function Scene() {
  const mouse = useRef({ x: 0, y: 0 });
  const speed = useRef(BASE_SPEED);
  const color = useMemo(readBrandColor, []);
  const sprite = useMemo(makeSprite, []);
  const colorFar = useMemo(() => color.clone().lerp(new THREE.Color("#ffffff"), 0.4), [color]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current.x = e.clientX / window.innerWidth - 0.5;
      mouse.current.y = e.clientY / window.innerHeight - 0.5;
    };
    const onScroll = () => {
      speed.current = BOOST_SPEED; // each scroll re-punches the warp
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, []);

  // Ease warp speed back to cruising whenever the user stops scrolling.
  useFrame(() => {
    speed.current += (BASE_SPEED - speed.current) * 0.02;
  });

  useEffect(() => () => sprite.dispose(), [sprite]);

  return (
    <>
      <CameraRig mouse={mouse} />
      <Starfield count={1900} size={2.4} opacity={0.95} color={color} sprite={sprite} speed={speed} />
      <Starfield count={1200} size={1.3} opacity={0.6} color={colorFar} sprite={sprite} speed={speed} />
    </>
  );
}

export function FxWebglScene() {
  return (
    <Canvas
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      dpr={[1, 2]}
      camera={{ position: [0, 0, 0], fov: 78, near: 0.1, far: 420 }}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
    >
      <Scene />
    </Canvas>
  );
}
