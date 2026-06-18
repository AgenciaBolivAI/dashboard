"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateTenantAdminAction,
  type AdminState,
} from "@/lib/actions/admin";

const initial: AdminState = { error: null };

const PLANS = ["starter", "pro", "business", "enterprise"] as const;
const STATUSES = ["active", "paused", "cancelled"] as const;

export function TenantAdminForm({
  tenant,
}: {
  tenant: {
    id: string;
    name: string;
    industry: string | null;
    language: string;
    timezone: string;
    plan: string;
    status: string;
  };
}) {
  const [state, action, pending] = useActionState(updateTenantAdminAction, initial);

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success("Tenant actualizado");
  }, [state]);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={tenant.id} />

      <Field label="Nombre" name="name" defaultValue={tenant.name} required />
      <Field label="Industria" name="industry" defaultValue={tenant.industry ?? ""} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Idioma" name="language" defaultValue={tenant.language} required />
        <Field label="Zona horaria" name="timezone" defaultValue={tenant.timezone} required />
      </div>

      <p className="text-xs text-muted-foreground">
        Para editar el canal de mensajería (Evolution / Meta / etc.) y sus
        credenciales, abre el tenant con &ldquo;Ver como tenant&rdquo; →
        Ajustes → Integraciones.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="plan">Plan</Label>
          <select
            id="plan"
            name="plan"
            defaultValue={tenant.plan}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Estado</Label>
          <select
            id="status"
            name="status"
            defaultValue={tenant.status}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}

function Field({
  label,
  ...rest
}: { label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={rest.name as string}>{label}</Label>
      <Input id={rest.name as string} {...rest} />
    </div>
  );
}
