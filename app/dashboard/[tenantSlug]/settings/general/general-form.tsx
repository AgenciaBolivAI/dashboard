"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateTenantGeneralAction, type TenantState } from "@/lib/actions/tenant";

const initial: TenantState = { error: null };

export function GeneralForm({
  tenant,
}: {
  tenant: {
    id: string;
    name: string;
    industry: string | null;
    language: string;
    timezone: string;
    whatsapp_number: string | null;
    support_email: string | null;
    support_whatsapp: string | null;
  };
}) {
  const [state, action, pending] = useActionState(updateTenantGeneralAction, initial);

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success("Cambios guardados");
  }, [state]);

  return (
    <form action={action} className="space-y-5 max-w-xl">
      <input type="hidden" name="tenant_id" value={tenant.id} />

      <Field label="Nombre del negocio" name="name" defaultValue={tenant.name} required />
      <Field label="Industria" name="industry" defaultValue={tenant.industry ?? ""} placeholder="fisioterapia, dental, inmobiliaria…" />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Idioma" name="language" defaultValue={tenant.language} placeholder="es, es-ES, es-BO" required />
        <Field label="Zona horaria" name="timezone" defaultValue={tenant.timezone} placeholder="America/La_Paz" required />
      </div>

      <Field
        label="WhatsApp del negocio"
        name="whatsapp_number"
        defaultValue={tenant.whatsapp_number ?? ""}
        placeholder="59171234567"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Email de soporte" name="support_email" type="email" defaultValue={tenant.support_email ?? ""} />
        <Field label="WhatsApp de soporte" name="support_whatsapp" defaultValue={tenant.support_whatsapp ?? ""} />
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}

function Field({
  label,
  ...rest
}: {
  label: string;
} & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-2">
      <Label htmlFor={rest.name}>{label}</Label>
      <Input id={rest.name as string} {...rest} />
    </div>
  );
}
