"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { updateTenantGeneralAction, type TenantState } from "@/lib/actions/tenant";

const initial: TenantState = { error: null };

const TIMEZONE_GROUPS: { label: string; zones: { value: string; label: string }[] }[] = [
  {
    label: "Global",
    zones: [{ value: "UTC", label: "UTC — Coordinated Universal Time" }],
  },
  {
    label: "North America",
    zones: [
      { value: "America/Los_Angeles", label: "Los Angeles — Pacific (UTC−8/−7)" },
      { value: "America/Denver", label: "Denver — Mountain (UTC−7/−6)" },
      { value: "America/Phoenix", label: "Phoenix — Arizona (UTC−7)" },
      { value: "America/Chicago", label: "Chicago — Central (UTC−6/−5)" },
      { value: "America/New_York", label: "New York — Eastern (UTC−5/−4)" },
      { value: "America/Toronto", label: "Toronto (UTC−5/−4)" },
      { value: "America/Mexico_City", label: "Mexico City (UTC−6)" },
      { value: "America/Cancun", label: "Cancún (UTC−5)" },
      { value: "America/Anchorage", label: "Anchorage — Alaska (UTC−9/−8)" },
      { value: "Pacific/Honolulu", label: "Honolulu — Hawaii (UTC−10)" },
    ],
  },
  {
    label: "Central & South America",
    zones: [
      { value: "America/Panama", label: "Panamá (UTC−5)" },
      { value: "America/Bogota", label: "Bogotá (UTC−5)" },
      { value: "America/Lima", label: "Lima (UTC−5)" },
      { value: "America/Guayaquil", label: "Guayaquil (UTC−5)" },
      { value: "America/Caracas", label: "Caracas (UTC−4)" },
      { value: "America/La_Paz", label: "La Paz (UTC−4)" },
      { value: "America/Santiago", label: "Santiago (UTC−4/−3)" },
      { value: "America/Asuncion", label: "Asunción (UTC−4/−3)" },
      { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires (UTC−3)" },
      { value: "America/Sao_Paulo", label: "São Paulo (UTC−3)" },
      { value: "America/Montevideo", label: "Montevideo (UTC−3)" },
      { value: "America/Santo_Domingo", label: "Santo Domingo (UTC−4)" },
      { value: "America/Puerto_Rico", label: "San Juan (UTC−4)" },
    ],
  },
  {
    label: "Europe",
    zones: [
      { value: "Europe/London", label: "London (UTC+0/+1)" },
      { value: "Europe/Dublin", label: "Dublin (UTC+0/+1)" },
      { value: "Europe/Lisbon", label: "Lisbon (UTC+0/+1)" },
      { value: "Europe/Madrid", label: "Madrid (UTC+1/+2)" },
      { value: "Europe/Paris", label: "Paris (UTC+1/+2)" },
      { value: "Europe/Amsterdam", label: "Amsterdam (UTC+1/+2)" },
      { value: "Europe/Berlin", label: "Berlin (UTC+1/+2)" },
      { value: "Europe/Rome", label: "Rome (UTC+1/+2)" },
      { value: "Europe/Stockholm", label: "Stockholm (UTC+1/+2)" },
      { value: "Europe/Warsaw", label: "Warsaw (UTC+1/+2)" },
      { value: "Europe/Athens", label: "Athens (UTC+2/+3)" },
      { value: "Europe/Istanbul", label: "Istanbul (UTC+3)" },
      { value: "Europe/Moscow", label: "Moscow (UTC+3)" },
    ],
  },
  {
    label: "Middle East & Africa",
    zones: [
      { value: "Africa/Lagos", label: "Lagos (UTC+1)" },
      { value: "Africa/Cairo", label: "Cairo (UTC+2/+3)" },
      { value: "Africa/Johannesburg", label: "Johannesburg (UTC+2)" },
      { value: "Africa/Nairobi", label: "Nairobi (UTC+3)" },
      { value: "Asia/Jerusalem", label: "Jerusalem (UTC+2/+3)" },
      { value: "Asia/Riyadh", label: "Riyadh (UTC+3)" },
      { value: "Asia/Dubai", label: "Dubai (UTC+4)" },
    ],
  },
  {
    label: "Asia",
    zones: [
      { value: "Asia/Karachi", label: "Karachi (UTC+5)" },
      { value: "Asia/Kolkata", label: "Kolkata / Mumbai (UTC+5:30)" },
      { value: "Asia/Dhaka", label: "Dhaka (UTC+6)" },
      { value: "Asia/Bangkok", label: "Bangkok (UTC+7)" },
      { value: "Asia/Jakarta", label: "Jakarta (UTC+7)" },
      { value: "Asia/Singapore", label: "Singapore (UTC+8)" },
      { value: "Asia/Hong_Kong", label: "Hong Kong (UTC+8)" },
      { value: "Asia/Shanghai", label: "Shanghai (UTC+8)" },
      { value: "Asia/Taipei", label: "Taipei (UTC+8)" },
      { value: "Asia/Manila", label: "Manila (UTC+8)" },
      { value: "Asia/Seoul", label: "Seoul (UTC+9)" },
      { value: "Asia/Tokyo", label: "Tokyo (UTC+9)" },
    ],
  },
  {
    label: "Oceania",
    zones: [
      { value: "Australia/Perth", label: "Perth (UTC+8)" },
      { value: "Australia/Adelaide", label: "Adelaide (UTC+9:30/+10:30)" },
      { value: "Australia/Sydney", label: "Sydney (UTC+10/+11)" },
      { value: "Pacific/Auckland", label: "Auckland (UTC+12/+13)" },
    ],
  },
];

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
    notification_email: string | null;
    notification_whatsapp_e164: string | null;
    notify_on_new_reservation: boolean;
    notify_on_reschedule: boolean;
    notify_on_cancel: boolean;
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
        <TimezoneField defaultValue={tenant.timezone} />
      </div>

      <Field
        label="WhatsApp del negocio"
        name="whatsapp_number"
        defaultValue={tenant.whatsapp_number ?? ""}
        placeholder="59171234567"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Email de soporte (visible al cliente)" name="support_email" type="email" defaultValue={tenant.support_email ?? ""} />
        <Field label="WhatsApp de soporte (visible al cliente)" name="support_whatsapp" defaultValue={tenant.support_whatsapp ?? ""} />
      </div>

      <div className="border-t pt-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Notificaciones de reservas</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Aquí recibes tú (dueño del negocio) los avisos cuando un cliente reserva, reprograma o cancela.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Email para avisos"
            name="notification_email"
            type="email"
            defaultValue={tenant.notification_email ?? ""}
            placeholder="duenodelnegocio@email.com"
          />
          <Field
            label="WhatsApp para avisos (E.164)"
            name="notification_whatsapp_e164"
            defaultValue={tenant.notification_whatsapp_e164 ?? ""}
            placeholder="+59171234567"
          />
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm">Avisarme cuando…</legend>
          <Checkbox name="notify_on_new_reservation" defaultChecked={tenant.notify_on_new_reservation} label="Se crea una reserva nueva" />
          <Checkbox name="notify_on_reschedule"      defaultChecked={tenant.notify_on_reschedule}      label="Se reprograma una reserva" />
          <Checkbox name="notify_on_cancel"          defaultChecked={tenant.notify_on_cancel}          label="Se cancela una reserva" />
        </fieldset>
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

function TimezoneField({ defaultValue }: { defaultValue: string }) {
  const known = new Set(TIMEZONE_GROUPS.flatMap((g) => g.zones.map((z) => z.value)));
  const isCustom = defaultValue && !known.has(defaultValue);
  return (
    <div className="space-y-2">
      <Label htmlFor="timezone">Zona horaria</Label>
      <select
        id="timezone"
        name="timezone"
        defaultValue={defaultValue}
        required
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
          "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {isCustom ? (
          <option value={defaultValue}>{defaultValue} (actual)</option>
        ) : null}
        {TIMEZONE_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.zones.map((z) => (
              <option key={z.value} value={z.value}>
                {z.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">
        Define cómo se muestran fechas y horarios en el calendario, los avisos y los mensajes del agente.
      </p>
    </div>
  );
}

function Checkbox({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        value="1"
        className="h-4 w-4 rounded border-input"
      />
      {label}
    </label>
  );
}
