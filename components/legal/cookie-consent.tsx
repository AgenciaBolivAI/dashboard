"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";

const COOKIE = "cookie_consent";
type Decision = "accepted" | "rejected";

export type CookieLabels = {
  title: string;
  body: string;
  learnMore: string;
  accept: string;
  reject: string;
};

function readDecision(): Decision | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(/(?:^|;\s*)cookie_consent=(accepted|rejected)/);
  return (m?.[1] as Decision) ?? null;
}

function writeDecision(d: Decision) {
  // 1-year, lax, site-wide.
  document.cookie = `${COOKIE}=${d}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * Cookie-consent gate. Google Analytics (gtag) drops the `_ga` cookie, which is
 * non-essential and needs opt-in under GDPR/ePrivacy — so GA only loads AFTER the
 * user accepts. Essential cookies (auth session, locale, theme) and Vercel's
 * cookieless analytics are unaffected. The banner shows until a choice is made.
 *
 * Labels are passed in from the (server) layout via getTranslations — this
 * client component intentionally does NOT call useTranslations, so it never
 * depends on the NextIntlClientProvider context being present where it renders.
 */
export function CookieConsent({ gaId, labels }: { gaId: string; labels: CookieLabels }) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDecision(readDecision());
    setReady(true);
  }, []);

  function choose(d: Decision) {
    writeDecision(d);
    setDecision(d);
  }

  return (
    <>
      {/* GA loads only with consent */}
      {decision === "accepted" && gaId ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
          <Script id="gtag-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];function gtag(){dataLayer.push(arguments);}gtag('js', new Date());gtag('config', '${gaId}');`}
          </Script>
        </>
      ) : null}

      {ready && decision === null ? (
        <div
          role="dialog"
          aria-label={labels.title}
          className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-2xl rounded-xl border border-border bg-card/95 p-4 shadow-xl backdrop-blur sm:p-5"
        >
          <div className="flex items-start gap-3">
            <Cookie className="mt-0.5 size-5 shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{labels.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {labels.body}{" "}
                <a
                  href="https://bolivai.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-foreground"
                >
                  {labels.learnMore}
                </a>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => choose("accepted")}>
                  {labels.accept}
                </Button>
                <Button size="sm" variant="outline" onClick={() => choose("rejected")}>
                  {labels.reject}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
