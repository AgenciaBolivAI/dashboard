import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl reads i18n/request.ts at build + runtime. The plugin wires up
// auto-discovery so we don't have to import it manually anywhere.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

// Content-Security-Policy (ENFORCING). The allowlist reflects what the browser
// actually loads — verified 2026-06-17 with a real authenticated headless-Chrome
// walk of every heavy page (marketing, calendar, voice, content, billing, leads):
// zero violations, only same-origin + Supabase (REST/storage/realtime wss) + GA +
// Vercel Analytics contacted. Server-side calls (OpenAI, ElevenLabs, Twilio,
// Stripe, n8n) and plain <a> links do NOT need CSP entries. Inline scripts (gtag
// init, next-themes no-flash, Next hydration) require 'unsafe-inline' since we
// don't run nonces. No 'unsafe-eval' needed (shared chunks + react-force-graph +
// d3 are eval/Function/Worker-free).
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://bolivai.cloud https://bolivai.com https://www.googletagmanager.com https://www.google-analytics.com",
  "font-src 'self' data:",
  "media-src 'self' blob: https://*.supabase.co",
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
  serverExternalPackages: ["@resvg/resvg-js", "sharp", "nodemailer"],
  // react-force-graph-2d ships an ESM/UMD hybrid that Turbopack's resolver
  // can't follow through its dependency chain (d3-force, d3-zoom, kapsule,
  // react-kapsule, accessor-fn). Force transpilation so Turbopack treats
  // them as source modules instead of pre-bundled.
  transpilePackages: [
    "react-force-graph-2d",
    "react-kapsule",
    "kapsule",
    "accessor-fn",
    // recharts pulls in many ESM d3-* packages; transpiling avoids Turbopack
    // resolver hiccups (same rationale as react-force-graph-2d).
    "recharts",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "bolivai.cloud" },
      { protocol: "https", hostname: "bolivai.com" },
    ],
  },
  // Type errors now FAIL the build (production safety net — regressions can't
  // ship silently). Supabase type lag on .update()/.insert() is handled with
  // narrow `as never` casts at the call site; run `npm run db:types` after a
  // schema migration to keep the generated types current.
  typescript: {
    ignoreBuildErrors: false,
  },
  // ESLint stays non-blocking for builds (warnings shouldn't fail a deploy);
  // lint runs in CI instead.
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Security response headers (added 2026-06-17 after VibeAuditt scan). All
  // enforced — CSP verified safe via an authenticated headless-Chrome walk of
  // every heavy page (see CSP above). Safe for a gated dashboard.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // 2yr HSTS + includeSubDomains (apex + www both serve HTTPS on
          // Vercel). preload intentionally omitted — it's hard to reverse.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: CSP,
          },
        ],
      },
    ];
  },
};

export default withNextIntl(config);
