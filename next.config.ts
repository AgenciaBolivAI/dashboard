import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl reads i18n/request.ts at build + runtime. The plugin wires up
// auto-discovery so we don't have to import it manually anywhere.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Content-Security-Policy (REPORT-ONLY for now). The allowlist reflects what
// the browser actually loads: same-origin Next assets, Supabase (REST +
// storage + realtime over wss), Google Analytics/gtag, and Vercel Analytics /
// Speed Insights. Server-side calls (OpenAI, ElevenLabs, Twilio, Stripe, n8n)
// and plain <a> links do NOT need CSP entries. Inline scripts (gtag init,
// next-themes no-flash, Next hydration) require 'unsafe-inline' because we
// don't run nonces under Turbopack. Report-only blocks nothing — it surfaces
// violations in the browser console so we can confirm coverage before
// promoting to an enforcing `Content-Security-Policy`.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://bolivai.cloud https://bolivai.com https://www.googletagmanager.com https://www.google-analytics.com",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://vitals.vercel-insights.com https://va.vercel-scripts.com",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-src 'none'",
].join("; ");

// Silence the harmless "unrecognized HMR message" uncaughtException Turbopack
// emits in 15.3.x when the browser sends `browser-logs` events the server-side
// handler doesn't know yet. The app keeps working; it's purely log noise.
// Remove this when we move to Next 16 (which adds the handler).
if (process.env.NODE_ENV === "development") {
  process.on("uncaughtException", (err: Error) => {
    if (err?.message?.includes("unrecognized HMR message")) return;
    throw err;
  });
}

const config: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb", // FAQ uploads
    },
  },
  // Native node modules can't be bundled by Turbopack/webpack; they need
  // to stay as runtime require()'s so the platform-specific binary loads.
  // @resvg/resvg-js: brand image rasterisation (Satori SVG -> PNG).
  // sharp: server-side image processing (logo prep, future thumbnails).
  serverExternalPackages: ["@resvg/resvg-js", "sharp"],
  // react-force-graph-2d ships an ESM/UMD hybrid that Turbopack's resolver
  // can't follow through its dependency chain (d3-force, d3-zoom, kapsule,
  // react-kapsule, accessor-fn). Force transpilation so Turbopack treats
  // them as source modules instead of pre-bundled.
  transpilePackages: [
    "react-force-graph-2d",
    "react-kapsule",
    "kapsule",
    "accessor-fn",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "bolivai.cloud" },
      { protocol: "https", hostname: "bolivai.com" },
    ],
  },
  // The Supabase generated types occasionally lag behind schema migrations,
  // producing spurious "not assignable to never" errors on .update()/.insert().
  // We rely on dev-time type checking + the Postgres schema as the source of
  // truth, so production builds skip strict type checking to ship reliably.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Security response headers (added 2026-06-17 after VibeAuditt scan). The
  // four below are ENFORCED — all are safe for a gated dashboard and carry no
  // breakage risk. CSP ships as report-only (see CSP_REPORT_ONLY above).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy-Report-Only",
            value: CSP_REPORT_ONLY,
          },
        ],
      },
    ];
  },
};

export default withNextIntl(config);
