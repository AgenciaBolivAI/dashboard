"use client";

import { useState, useTransition } from "react";
import { Loader2, Sparkles, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startTopupAction } from "@/lib/actions/billing";
import { TOPUP_PRESETS, calculateBonusCredits } from "@/lib/billing/pricing";
import { cn } from "@/lib/utils";

const MIN_DOLLARS = 10;
const MAX_DOLLARS = 10_000;

export function TopupPicker({
  tenantId,
  tenantSlug,
}: {
  tenantId: string;
  tenantSlug: string;
}) {
  const [pending, startTransition] = useTransition();
  const [customDollars, setCustomDollars] = useState("");

  function go(cents: number) {
    startTransition(async () => {
      const res = await startTopupAction(tenantId, tenantSlug, cents);
      if (res.error || !res.url) {
        toast.error(res.error ?? "No se pudo abrir el checkout");
        return;
      }
      // Stripe-hosted checkout. Browser leaves bolivai.cloud → returns
      // to /billing?topup=success&session_id=... once webhook fires.
      window.location.href = res.url;
    });
  }

  function goCustom() {
    const dollars = parseFloat(customDollars);
    if (!Number.isFinite(dollars) || dollars < MIN_DOLLARS || dollars > MAX_DOLLARS) {
      toast.error(`Monto válido: $${MIN_DOLLARS} - $${MAX_DOLLARS.toLocaleString()}`);
      return;
    }
    go(Math.round(dollars * 100));
  }

  const customCents = (() => {
    const dollars = parseFloat(customDollars);
    if (!Number.isFinite(dollars)) return 0;
    return Math.round(dollars * 100);
  })();
  const customBonus = calculateBonusCredits(customCents);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-base flex items-center gap-2">
          <CreditCard className="size-4 text-primary" />
          Recargar créditos
        </h3>
        <span className="text-xs text-muted-foreground">$1 = 100 créditos</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-4">
        {TOPUP_PRESETS.map((p) => (
          <button
            key={p.cents}
            type="button"
            onClick={() => go(p.cents)}
            disabled={pending}
            className={cn(
              "flex flex-col items-start rounded-lg border bg-secondary/30 p-3 text-left transition",
              "hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50",
            )}
          >
            <span className="text-lg font-display font-bold">{p.label}</span>
            <span className="text-xs text-muted-foreground">
              {p.cents} créditos
              {p.bonus > 0 && (
                <span className="ml-1 inline-flex items-center gap-0.5 text-primary">
                  <Sparkles className="size-3" />+{p.bonus}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      <div className="border-t pt-4">
        <Label className="text-xs uppercase tracking-wider text-muted-foreground">
          Monto personalizado
        </Label>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-muted-foreground">$</span>
          <Input
            type="number"
            min={MIN_DOLLARS}
            max={MAX_DOLLARS}
            step="1"
            placeholder="100"
            value={customDollars}
            onChange={(e) => setCustomDollars(e.target.value)}
            disabled={pending}
            className="max-w-[160px]"
          />
          <Button onClick={goCustom} disabled={pending || !customDollars} className="gap-1.5">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
            Pagar
          </Button>
        </div>
        {customCents >= MIN_DOLLARS * 100 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Recibirás <span className="text-foreground font-medium">{customCents.toLocaleString()} créditos</span>
            {customBonus > 0 && (
              <>
                {" "}+ <span className="text-primary font-medium">{customBonus.toLocaleString()} de bono</span>
              </>
            )}
            {" "}= <span className="text-foreground font-bold">
              {(customCents + customBonus).toLocaleString()} créditos
            </span>
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Pago seguro vía Stripe. Los créditos aparecen en tu balance
          inmediatamente después del pago.
        </p>
      </div>
    </Card>
  );
}
