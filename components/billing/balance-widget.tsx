import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Coins, AlertTriangle } from "lucide-react";
import { getBalance } from "@/lib/billing/credits";
import { cn } from "@/lib/utils";

/**
 * Server-rendered balance pill in the shell header. Click → billing page.
 * Color-coded: green when healthy, amber when low, red when zero.
 */
export async function BalanceWidget({
  tenantId,
  tenantSlug,
}: {
  tenantId: string;
  tenantSlug: string;
}) {
  const bal = await getBalance(tenantId);
  const t = await getTranslations("billing");
  if (!bal) {
    return (
      <Link
        href={`/dashboard/${tenantSlug}/billing`}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border bg-secondary text-xs font-medium hover:bg-secondary/80 transition"
      >
        <Coins className="size-3.5" />
        {t("widget_no_credits")}
      </Link>
    );
  }

  const dollars = (bal.available_credits / 100).toFixed(2);
  const tone = bal.is_zero
    ? "border-destructive/40 bg-destructive/10 text-destructive"
    : bal.is_low
      ? "border-amber-500/40 bg-amber-500/10 text-amber-600"
      : "border-primary/40 bg-primary/10 text-primary";

  return (
    <Link
      href={`/dashboard/${tenantSlug}/billing`}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition hover:brightness-110",
        tone,
      )}
      title={t("widget_tooltip", {
        available: bal.available_credits.toLocaleString(),
        reserved: bal.reserved_credits,
        reservedFormatted: bal.reserved_credits.toLocaleString(),
        spent: bal.lifetime_spent_credits.toLocaleString(),
      })}
    >
      {bal.is_zero || bal.is_low ? (
        <AlertTriangle className="size-3.5" />
      ) : (
        <Coins className="size-3.5" />
      )}
      ${dollars}
      <span className="opacity-70">
        ({bal.available_credits.toLocaleString()})
      </span>
    </Link>
  );
}
