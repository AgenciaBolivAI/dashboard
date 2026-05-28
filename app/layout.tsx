import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Instrument_Sans, Syne } from "next/font/google";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const GA_ID = "G-FBZS5H9719";

// Self-hosted, swap-display fonts. Eliminates render-blocking requests
// to fonts.googleapis.com and removes the FOUT on cold starts.
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

const syne = Syne({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BolivAI Cloud",
  description: "Panel de gestión de tus agentes de IA — BolivAI",
  // Next.js auto-detects app/icon.svg and serves it as the favicon.
  // The explicit `icons` field is no longer needed.
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`dark ${instrumentSans.variable} ${syne.variable}`}
      suppressHydrationWarning
    >
      <body>
        {children}
        <Toaster position="top-right" theme="dark" />
        <Analytics />
        <SpeedInsights />
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
          strategy="afterInteractive"
        />
        <Script id="gtag-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_ID}');
          `}
        </Script>
      </body>
    </html>
  );
}
