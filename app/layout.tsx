import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Syne } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { ThemeProvider } from "@/components/shell/theme-provider";
import { CookieConsent } from "@/components/legal/cookie-consent";
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
  // metadataBase makes the relative OG/Twitter image URLs resolve to absolute
  // https:// links (required by Next + the social crawlers).
  metadataBase: new URL("https://bolivai.cloud"),
  title: {
    default: "BolivAI Cloud — Tu fuerza laboral de agentes de IA",
    template: "%s · BolivAI Cloud",
  },
  description:
    "El panel para gestionar tu fuerza laboral de agentes de IA: ventas, soporte, WhatsApp, leads y marketing en un solo lugar.",
  applicationName: "BolivAI Cloud",
  // Next.js auto-detects app/icon.svg and serves it as the favicon.
  openGraph: {
    type: "website",
    siteName: "BolivAI Cloud",
    title: "BolivAI Cloud — Tu fuerza laboral de agentes de IA",
    description:
      "Gestiona tus agentes de IA de ventas, soporte y marketing desde un solo panel.",
    url: "https://bolivai.cloud",
    locale: "es_ES",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "BolivAI" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "BolivAI Cloud — Tu fuerza laboral de agentes de IA",
    description:
      "Gestiona tus agentes de IA de ventas, soporte y marketing desde un solo panel.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Locale + messages come from i18n/request.ts via the next-intl plugin.
  // Both helpers read the `locale` cookie under the hood.
  const locale = await getLocale();
  const messages = await getMessages();
  const tc = await getTranslations("cookies");
  const cookieLabels = {
    title: tc("title"),
    body: tc("body"),
    learnMore: tc("learn_more"),
    accept: tc("accept"),
    reject: tc("reject"),
  };

  return (
    <html
      lang={locale}
      className={`${instrumentSans.variable} ${syne.variable}`}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider>
          <NextIntlClientProvider locale={locale} messages={messages}>
            {children}
          </NextIntlClientProvider>
        </ThemeProvider>
        {/* Vercel analytics are cookieless (no consent needed). Google Analytics
            drops a cookie, so it loads only after cookie consent. Labels are
            passed in (server-translated) so the banner needs no intl context. */}
        <Analytics />
        <SpeedInsights />
        <CookieConsent gaId={GA_ID} labels={cookieLabels} />
      </body>
    </html>
  );
}
