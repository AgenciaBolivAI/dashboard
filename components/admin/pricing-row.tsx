"use client";

import { useState, useTransition, useActionState } from "react";
import { Save, Loader2, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  updateCreditPricingAction,
  type AdminPricingState,
} from "@/lib/actions/admin-pricing";
import { cn } from "@/lib/utils";

const initial: AdminPricingState = { error: null };

type Row = {
  action_key: string;
  credits_per_unit: number;
  unit_label: string;
  description: string | null;
  cost_per_unit_micros: number;
  vendor_cost_micros: Record<string, number>;
  margin_micros: number;
  margin_pct: number | null;
  vendor_sum_micros: number;
  vendor_sum_matches: boolean;
  updated_at: string;
};

export function PricingRow({ row }: { row: Row }) {
  const [expanded, setExpanded] = useState(false);
  const [state, action, pending] = useActionState(updateCreditPricingAction, initial);
  const [credits, setCredits] = useState(row.credits_per_unit);
  const [costMicros, setCostMicros] = useState(row.cost_per_unit_micros);
  const [description, setDescription] = useState(row.description ?? "");
  const [vendorJson, setVendorJson] = useState(
    JSON.stringify(row.vendor_cost_micros, null, 2),
  );

  // Reflect server-action result via toast
  if (state.success) {
    // Note: useActionState retains last state, so we only toast once per change.
    // The router.refresh from revalidatePath will repaint with new server data.
  }

  const dirty =
    credits !== row.credits_per_unit ||
    costMicros !== row.cost_per_unit_micros ||
    description !== (row.description ?? "") ||
    vendorJson.trim() !== JSON.stringify(row.vendor_cost_micros, null, 2);

  const liveRevenueMicros = credits * 10_000;
  const liveMargin = liveRevenueMicros - costMicros;
  const liveMarginPct =
    liveRevenueMicros > 0 ? Math.round((liveMargin / liveRevenueMicros) * 1000) / 10 : null;

  return (
    <>
      <tr className={cn("border-b border-border", expanded && "bg-muted/30")}>
        <td className="p-2">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="text-muted-foreground hover:text-foreground"
            aria-label={expanded ? "Colapsar" : "Expandir"}
          >
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        </td>
        <td className="p-2 font-mono text-xs">{row.action_key}</td>
        <td className="p-2 text-right font-mono text-sm">
          {credits} cr
          {dirty && (
            <span className="text-xs text-amber-600 ml-1">
              (antes {row.credits_per_unit})
            </span>
          )}
        </td>
        <td className="p-2 text-right font-mono text-sm text-muted-foreground">
          ${(credits / 100).toFixed(2)}
        </td>
        <td className="p-2 text-right font-mono text-xs text-amber-600">
          ${(costMicros / 1_000_000).toFixed(4)}
        </td>
        <td
          className={cn(
            "p-2 text-right font-mono text-sm font-semibold",
            liveMargin > 0 && "text-primary",
            liveMargin < 0 && "text-destructive",
          )}
        >
          ${(liveMargin / 1_000_000).toFixed(4)}
          {liveMarginPct != null && (
            <span className="text-xs text-muted-foreground ml-1">
              {liveMarginPct}%
            </span>
          )}
        </td>
        <td className="p-2 text-right">
          {!row.vendor_sum_matches && (
            <Badge variant="warning" className="gap-1 text-[10px]">
              <AlertTriangle className="size-3" />
              vendor ≠ cost
            </Badge>
          )}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="p-0">
            <form action={action} className="bg-muted/20 p-4 space-y-3 border-b border-border">
              <input type="hidden" name="action_key" value={row.action_key} />

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">credits_per_unit (1 cr = $0.01)</Label>
                  <Input
                    type="number"
                    name="credits_per_unit"
                    value={credits}
                    onChange={(e) => setCredits(Number(e.target.value) || 0)}
                    min={0}
                    step={1}
                  />
                  <p className="text-xs text-muted-foreground">
                    Ingreso por unidad: <strong>${(credits / 100).toFixed(2)}</strong> ·
                    Revenue micros: <strong>{liveRevenueMicros.toLocaleString()}</strong>
                  </p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">cost_per_unit_micros (1M = $1.00)</Label>
                  <Input
                    type="number"
                    name="cost_per_unit_micros"
                    value={costMicros}
                    onChange={(e) => setCostMicros(Number(e.target.value) || 0)}
                    min={0}
                    step={1000}
                  />
                  <p className="text-xs text-muted-foreground">
                    Nuestro costo: <strong>${(costMicros / 1_000_000).toFixed(4)}</strong>
                  </p>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Margen calculado</Label>
                  <div
                    className={cn(
                      "h-9 px-3 rounded-md border border-border flex items-center font-mono text-sm",
                      liveMargin >= 0 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive",
                    )}
                  >
                    ${(liveMargin / 1_000_000).toFixed(4)}
                    {liveMarginPct != null && (
                      <span className="text-xs text-muted-foreground ml-2">{liveMarginPct}%</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Descripción</Label>
                <Input
                  name="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="(opcional)"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">vendor_cost_micros (JSON)</Label>
                <textarea
                  name="vendor_cost_micros_json"
                  value={vendorJson}
                  onChange={(e) => setVendorJson(e.target.value)}
                  rows={5}
                  className="w-full font-mono text-xs px-3 py-2 rounded-md border border-border bg-background"
                  placeholder='{"openai": 50000, "twilio": 10000}'
                />
                <p className="text-xs text-muted-foreground">
                  Suma actual: {row.vendor_sum_micros.toLocaleString()} micros = $
                  {(row.vendor_sum_micros / 1_000_000).toFixed(4)}
                  {!row.vendor_sum_matches && (
                    <span className="ml-2 text-amber-600 font-semibold">
                      (no coincide con cost_per_unit_micros: {row.cost_per_unit_micros.toLocaleString()})
                    </span>
                  )}
                </p>
              </div>

              {state.error && (
                <p className="text-sm text-destructive">{state.error}</p>
              )}

              <div className="flex gap-2 items-center">
                <Button type="submit" disabled={!dirty || pending} className="gap-1.5">
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Guardar
                </Button>
                <p className="text-xs text-muted-foreground">
                  Última actualización: {new Date(row.updated_at).toLocaleString("es-BO")}
                </p>
              </div>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
