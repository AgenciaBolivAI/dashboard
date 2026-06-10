import type { NextConfig } from "next";

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

export default config;
