"use client";

import { useActionState, useEffect, useState } from "react";
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

const PRESETS = [10, 25, 50, 100];

/**
 * Owner-only: add credits to any tenant's balance. $1 = 100 credits.
 * Goes through credit_topup tagged source=admin_grant. Shows a live
 * "= N credits" preview so the dollar→credit mapping is obvious.
 */
export function GrantCreditsForm({ tenantId }: { tenantId: string }) {
  const [state, action, pending] = useActionState(grantTenantCreditsAction, initial);
  const [amount, setAmount] = useState("");

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(
        `+${(state.credits_added ?? 0).toLocaleString("es")} créditos · nuevo saldo ${(
          (state.new_balance_credits ?? 0) / 100
        ).toLocaleString("es", { style: "currency", currency: "USD" })}`,
      );
      setAmount("");
    }
  }, [state]);

  const dollars = parseFloat(amount || "0");
  const credits = Number.isFinite(dollars) && dollars > 0 ? Math.round(dollars * 100) : 0;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="tenant_id" value={tenantId} />

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

      <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2">
        <div className="space-y-1">
          <Label htmlFor="amount_usd" className="text-xs">
            Monto (USD)
          </Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              $
            </span>
            <Input
              id="amount_usd"
              name="amount_usd"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100"
              className="pl-6"
              required
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="grant_note" className="text-xs">
            Nota (opcional)
          </Label>
          <Input
            id="grant_note"
            name="note"
            placeholder="Ej: cortesía de lanzamiento"
            maxLength={200}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <Coins className="size-3" />
          {credits > 0
            ? `= ${credits.toLocaleString("es")} créditos`
            : "$1 = 100 créditos"}
        </p>
        <Button type="submit" disabled={pending || credits <= 0} size="sm" className="gap-1.5">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Gift className="size-4" />}
          Acreditar
        </Button>
      </div>
    </form>
  );
}
