import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getBalance } from "@/lib/billing/credits";

/**
 * Renders at the top of every tenant dashboard page. Yellow when balance
 * is low, red when zero. Stays out of the way (null) when healthy.
 */
export async function OutOfCreditsBanner({
  tenantId,
  tenantSlug,
}: {
  tenantId: string;
  tenantSlug: string;
}) {
  const bal = await getBalance(tenantId);
  if (!bal) return null;

  const t = await getTranslations("billing");

  if (bal.is_zero) {
    return (
      <div className="border-b border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="size-4" />
          <span className="font-medium">{t("banner_zero_title")}</span>
          <span className="text-destructive/80">
            {t("banner_zero_description")}
          </span>
        </div>
        <Link
          href={`/dashboard/${tenantSlug}/billing`}
          className="rounded-md bg-destructive text-destructive-foreground px-3 py-1.5 text-xs font-semibold whitespace-nowrap hover:brightness-110 transition"
        >
          {t("banner_topup_now")}
        </Link>
      </div>
    );
  }

  if (bal.is_low) {
    return (
      <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-4" />
          <span>
            {t.rich("banner_low_balance", {
              credits: bal.available_credits.toLocaleString(),
              dollars: (bal.available_credits / 100).toFixed(2),
              b: (chunks) => <span className="font-semibold">{chunks}</span>,
            })}
          </span>
        </div>
        <Link
          href={`/dashboard/${tenantSlug}/billing`}
          className="rounded-md bg-amber-500 text-white px-3 py-1 text-xs font-semibold whitespace-nowrap hover:brightness-110 transition"
        >
          {t("banner_topup")}
        </Link>
      </div>
    );
  }

  return null;
}
