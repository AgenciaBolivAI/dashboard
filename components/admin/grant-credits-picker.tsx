"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Coins, Loader2, Gift } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  grantTenantCreditsAction,
  type GrantState,
} from "@/lib/actions/admin";

const initial: GrantState = { error: null };
const PRESETS = [5, 10, 25, 50, 100];

type TenantOption = { id: string; name: string; slug: string };

/**
 * Owner-only central credit gift: pick ANY tenant from a dropdown + amount,
 * straight from /admin/overview. Same grantTenantCreditsAction as the per-tenant
 * form — just swaps the hidden tenant_id for a <select>. $1 = 100 credits,
 * tagged source=admin_grant. Perfect for "gift a few credits for testing".
 */
export function GrantCreditsPicker({ tenants }: { tenants: TenantOption[] }) {
  const t = useTranslations("admin_overview");
  const [state, action, pending] = useActionState(grantTenantCreditsAction, initial);
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? "");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(
        t("grant_success", {
          credits: (state.credits_added ?? 0).toLocaleString(),
          balance: ((state.new_balance_credits ?? 0) / 100).toLocaleString(undefined, {
            style: "currency",
            currency: "USD",
          }),
        }),
      );
      setAmount("");
    }
  }, [state, t]);

  const dollars = parseFloat(amount || "0");
  const credits = Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : 0;

  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2">
        <div className="space-y-1">
          <Label htmlFor="grant_tenant" className="text-xs">
            {t("grant_business")}
          </Label>
          <select
            id="grant_tenant"
            name="tenant_id"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            required
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {tenants.length === 0 ? (
              <option value="">{t("grant_no_business")}</option>
            ) : (
              tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.slug})
                </option>
              ))
            )}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="grant_amount" className="text-xs">
            {t("grant_amount_usd")}
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              $
            </span>
            <Input
              id="grant_amount"
              name="amount_usd"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="10"
              className="pl-6"
              required
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setAmount(String(p))}
            className="px-2.5 py-1 rounded-md text-xs border border-input hover:border-primary hover:text-primary transition"
          >
            ${p}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        <Label htmlFor="grant_note" className="text-xs">
          {t("grant_note")}
        </Label>
        <Input
          id="grant_note"
          name="note"
          placeholder={t("grant_note_placeholder")}
          maxLength={200}
        />
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <Coins className="size-3" />
          {credits > 0
            ? t("grant_credits_preview", { credits: credits.toLocaleString() })
            : t("grant_credits_hint")}
        </p>
        <Button
          type="submit"
          disabled={pending || credits <= 0 || !tenantId}
          size="sm"
          className="gap-1.5"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Gift className="size-4" />}
          {t("grant_gift_button")}
        </Button>
      </div>
    </form>
  );
}
