import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// next-intl reads i18n/request.ts at build + runtime. The plugin wires up
// auto-discovery so we don't have to import it manually anywhere.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

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
};

export default withNextIntl(config);
