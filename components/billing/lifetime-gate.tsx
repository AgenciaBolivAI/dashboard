"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startLifetimeCheckoutAction } from "@/lib/actions/lifetime";
import { signOutAction } from "@/lib/actions/auth";

/**
 * Full-page paywall shown to tenants that haven't paid the one-time Founding
 * Member fee. Owners/admins can pay; others are told to ask an admin.
 */
export function LifetimeGate({
  tenantSlug,
  foundingCount,
  cap,
  canPay,
}: {
  tenantSlug: string;
  foundingCount: number;
  cap: number;
  canPay: boolean;
}) {
  const t = useTranslations("lifetime");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [canceled, setCanceled] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("lifetime") === "canceled") {
      setCanceled(true);
    }
  }, []);

  function pay() {
    setErr(null);
    start(async () => {
      const r = await startLifetimeCheckoutAction(tenantSlug);
      if (r?.error) setErr(t("error"));
    });
  }

  const next = (foundingCount + 1).toLocaleString();
  const capStr = cap.toLocaleString();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <span className="font-display text-2xl font-extrabold">
            Boliv<span className="text-primary">AI</span>
          </span>
        </div>

        <div className="rounded-2xl border border-primary/30 bg-gradient-to-b from-primary/5 to-card p-8 text-center">
          <h1 className="font-display text-2xl font-extrabold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-2">{t("subtitle")}</p>

          <div className="mt-6 flex items-baseline justify-center gap-2">
            <span className="font-display text-5xl font-extrabold">$40</span>
            <span className="text-muted-foreground">{t("once")}</span>
          </div>
          <p className="mt-1 font-medium">{t("headline")}</p>

          <ul className="mt-6 space-y-2 text-left text-sm">
            {(["b1", "b2", "b3"] as const).map((k) => (
              <li key={k} className="flex gap-2">
                <Check className="size-4 text-primary shrink-0 mt-0.5" />
                <span>{t(k)}</span>
              </li>
            ))}
          </ul>

          {canceled ? <p className="mt-4 text-xs text-amber-500">{t("canceled")}</p> : null}

          {canPay ? (
            <>
              <Button className="w-full mt-6" disabled={pending} onClick={pay}>
                {pending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> {t("processing")}
                  </>
                ) : (
                  t("cta")
                )}
              </Button>
              {err ? <p className="mt-2 text-sm text-destructive">{err}</p> : null}
              <p className="mt-3 text-xs text-muted-foreground">{t("secure")}</p>
            </>
          ) : (
            <p className="mt-6 text-sm text-muted-foreground">{t("non_admin")}</p>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            {t("scarcity", { cap: capStr, next })}
          </p>
        </div>

        <div className="text-center mt-6">
          <form action={signOutAction}>
            <button
              type="submit"
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              {t("signout")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
