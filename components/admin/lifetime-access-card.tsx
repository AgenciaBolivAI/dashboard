"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
  const [pending, startTransition] = useTransition();
  const [pct, setPct] = useState(String(discountPct ?? 0));

  function saveDiscount() {
    const n = Math.min(100, Math.max(0, Math.round(Number(pct) || 0)));
    startTransition(async () => {
      const r = await setLifetimeDiscountAction(tenantId, n);
      if (r.error) toast.error(r.error);
      else {
        toast.success(`Descuento guardado: ${n}%`);
        router.refresh();
      }
    });
  }

  function grantFree() {
    startTransition(async () => {
      const r = await waiveLifetimeAction(tenantId);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Acceso de por vida otorgado (gratis)");
        router.refresh();
      }
    });
  }

  return (
    <Card className="p-5">
      <div className="mb-2 flex items-center gap-2">
        <Gift className="size-4 text-primary" />
        <h3 className="font-display font-semibold">Acceso de por vida (Founding Member)</h3>
      </div>

      {lifetimeAccess ? (
        <p className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
          <Check className="size-4" /> Activo · Miembro #{foundingNumber ?? "—"} · pagó{" "}
          {paidCents != null ? `$${(paidCents / 100).toFixed(2)}` : "—"}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Aún no activo. Se aplica la tarifa de $40 con el descuento actual de <strong>{discountPct}%</strong>.
        </p>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-xs uppercase tracking-wider text-muted-foreground">
            Descuento del tenant (0–100%)
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
              Guardar
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            100% = gratis al activar. Aplica al checkout de este tenant.
          </p>
        </div>

        <div className="flex items-end">
          {!lifetimeAccess ? (
            <Button onClick={grantFree} disabled={pending} className="gap-1.5">
              <Gift className="size-4" /> Otorgar gratis ahora
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
