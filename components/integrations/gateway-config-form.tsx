"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  updateGatewayConfigAction,
  type TenantState,
} from "@/lib/actions/tenant";
import { GATEWAYS, getGateway } from "@/lib/templates";

const initial: TenantState = { error: null };

export function GatewayConfigForm({
  tenantId,
  currentGateway,
  currentConfig,
}: {
  tenantId: string;
  currentGateway: string;
  currentConfig: Record<string, unknown>;
}) {
  const [state, action, pending] = useActionState(updateGatewayConfigAction, initial);
  const [gatewayId, setGatewayId] = useState(currentGateway);
  const gateway = useMemo(() => getGateway(gatewayId), [gatewayId]);

  // Per-gateway config: keep separate buckets so switching back doesn't lose values.
  const [configByGateway, setConfigByGateway] = useState<
    Record<string, Record<string, string>>
  >(() => ({
    [currentGateway]: Object.fromEntries(
      Object.entries(currentConfig).map(([k, v]) => [k, String(v ?? "")]),
    ),
  }));

  const config = configByGateway[gatewayId] ?? {};

  function setValue(key: string, value: string) {
    setConfigByGateway((prev) => ({
      ...prev,
      [gatewayId]: { ...(prev[gatewayId] ?? {}), [key]: value },
    }));
  }

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success("Gateway actualizado");
  }, [state]);

  const configJson = JSON.stringify(config);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="tenant_id" value={tenantId} />
      <input type="hidden" name="gateway" value={gatewayId} />
      <input type="hidden" name="config_json" value={configJson} />

      {/* Gateway picker */}
      <div className="space-y-2">
        <Label>Canal</Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {GATEWAYS.map((g) => {
            const disabled = g.status === "coming_soon";
            const active = g.id === gatewayId;
            return (
              <button
                key={g.id}
                type="button"
                disabled={disabled}
                onClick={() => setGatewayId(g.id)}
                className={
                  "rounded-md border px-3 py-2 text-left transition " +
                  (active
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:border-border ") +
                  (disabled ? "opacity-50 cursor-not-allowed" : "")
                }
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <p className="text-sm font-medium">{g.short}</p>
                  {disabled ? (
                    <Badge variant="muted" className="text-[10px] shrink-0">
                      Pronto
                    </Badge>
                  ) : null}
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2">
                  {g.description}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Per-field config */}
      {gateway.configFields.length > 0 ? (
        <div className="space-y-4 pt-2">
          {gateway.configFields.map((f) => (
            <div key={f.key} className="space-y-2">
              <Label htmlFor={`gw-${f.key}`}>
                {f.label}
                {f.required ? (
                  <span className="text-destructive ml-1">*</span>
                ) : null}
              </Label>
              <Input
                id={`gw-${f.key}`}
                type={f.type === "password" ? "password" : "text"}
                placeholder={f.placeholder}
                value={config[f.key] ?? ""}
                onChange={(e) => setValue(f.key, e.target.value)}
                className={f.type === "password" ? "font-mono" : ""}
              />
              {f.description ? (
                <p className="text-xs text-muted-foreground">{f.description}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <Button type="submit" disabled={pending || gateway.status === "coming_soon"}>
        {pending ? "Guardando…" : "Guardar configuración"}
      </Button>
    </form>
  );
}
