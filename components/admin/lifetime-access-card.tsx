"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Gift, Check } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { waiveLifetimeAction, setLifetimeDiscountAction } from "@/lib/actions/admin";

/**
 * Admin control over a tenant's one-time Founding Member fee: set a 0–100%
 * discount (100% = free on activation) or grant it free outright. Internal
 * admin tooling — copy matches the rest of the (Spanish) admin panel.
 */
export function LifetimeAccessCard({
  tenantId,
  lifetimeAccess,
  foundingNumber,
  discountPct,
  paidCents,
}: {
  tenantId: string;
  lifetimeAccess: boolean;
  foundingNumber: number | null;
  discountPct: number;
  paidCents: number | null;
}) {
  const router = useRouter();
  const t = useTranslations("admin_tenant_detail");
  const [pending, startTransition] = useTransition();
  const [pct, setPct] = useState(String(discountPct ?? 0));

  function saveDiscount() {
    const n = Math.min(100, Math.max(0, Math.round(Number(pct) || 0)));
    startTransition(async () => {
      const r = await setLifetimeDiscountAction(tenantId, n);
      if (r.error) toast.error(r.error);
      else {
        toast.success(t("lifetime_discount_saved", { pct: n }));
        router.refresh();
      }
    });
  }

  function grantFree() {
    startTransition(async () => {
      const r = await waiveLifetimeAction(tenantId);
      if (r.error) toast.error(r.error);
      else {
        toast.success(t("lifetime_granted_free"));
        router.refresh();
      }
    });
  }

  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center gap-2">
        <Gift className="size-4 text-primary" />
        <h3 className="font-display font-semibold">{t("lifetime_card_title")}</h3>
      </div>

      {lifetimeAccess ? (
        <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
          <Check className="size-4" />{" "}
          {t("lifetime_active", {
            number: foundingNumber ?? "—",
            paid: paidCents != null ? `$${(paidCents / 100).toFixed(2)}` : "—",
          })}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t.rich("lifetime_inactive", {
            pct: discountPct,
            strong: (c) => <strong>{c}</strong>,
          })}
        </p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            {t("lifetime_discount_label")}
          </label>
          <div className="mt-1.5 flex gap-2">
            <Input
              type="number"
              min={0}
              max={100}
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              className="w-24"
              disabled={pending}
            />
            <Button variant="outline" size="sm" onClick={saveDiscount} disabled={pending}>
              {t("save")}
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t("lifetime_discount_hint")}
          </p>
        </div>

        <div className="flex items-end">
          {!lifetimeAccess ? (
            <Button onClick={grantFree} disabled={pending} className="gap-1.5">
              <Gift className="size-4" /> {t("lifetime_grant_free")}
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
