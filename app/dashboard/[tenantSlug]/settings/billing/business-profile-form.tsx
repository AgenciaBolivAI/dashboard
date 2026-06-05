"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  updateBusinessProfileAction,
  type BillingState,
} from "@/lib/actions/billing";

const initial: BillingState = { error: null };

const CURRENCIES = ["USD", "EUR", "GBP", "MXN", "BRL", "CLP", "PEN", "COP", "ARS", "CAD", "AUD"];

const COUNTRIES = [
  ["US", "Estados Unidos"], ["CA", "Canadá"], ["MX", "México"],
  ["BR", "Brasil"], ["AR", "Argentina"], ["CL", "Chile"], ["CO", "Colombia"],
  ["PE", "Perú"], ["EC", "Ecuador"], ["VE", "Venezuela"], ["BO", "Bolivia"],
  ["UY", "Uruguay"], ["PY", "Paraguay"], ["PA", "Panamá"], ["CR", "Costa Rica"],
  ["DO", "Rep. Dominicana"], ["GT", "Guatemala"], ["HN", "Honduras"],
  ["SV", "El Salvador"], ["NI", "Nicaragua"], ["PR", "Puerto Rico"],
  ["ES", "España"], ["PT", "Portugal"], ["GB", "Reino Unido"],
  ["FR", "Francia"], ["DE", "Alemania"], ["IT", "Italia"],
  ["NL", "Países Bajos"], ["IE", "Irlanda"],
  ["AU", "Australia"], ["NZ", "Nueva Zelanda"],
  ["JP", "Japón"], ["SG", "Singapur"], ["IN", "India"],
];

export function BusinessProfileForm({
  tenant,
}: {
  tenant: {
    id: string;
    legal_name: string | null;
    tax_id: string | null;
    address_line1: string | null;
    address_line2: string | null;
    address_city: string | null;
    address_state: string | null;
    address_postal_code: string | null;
    address_country: string | null;
    invoice_footer: string | null;
    invoice_default_currency: string;
  };
}) {
  const [state, action, pending] = useActionState(
    updateBusinessProfileAction,
    initial,
  );

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success("Datos guardados");
  }, [state]);

  return (
    <form action={action} className="space-y-5 max-w-2xl">
      <input type="hidden" name="tenant_id" value={tenant.id} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label="Razón social"
          name="legal_name"
          defaultValue={tenant.legal_name ?? ""}
          placeholder="BolivAI LLC"
        />
        <Field
          label="ID fiscal / RFC / VAT / EIN"
          name="tax_id"
          defaultValue={tenant.tax_id ?? ""}
          placeholder="EIN, RFC, NIT, CUIT, VAT…"
        />
      </div>

      <Field
        label="Dirección (línea 1)"
        name="address_line1"
        defaultValue={tenant.address_line1 ?? ""}
        placeholder="30 N Gould St Ste R"
      />
      <Field
        label="Dirección (línea 2)"
        name="address_line2"
        defaultValue={tenant.address_line2 ?? ""}
        placeholder="Suite, depto, referencia…"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field
          label="Ciudad"
          name="address_city"
          defaultValue={tenant.address_city ?? ""}
          placeholder="Sheridan"
        />
        <Field
          label="Estado / Provincia"
          name="address_state"
          defaultValue={tenant.address_state ?? ""}
          placeholder="WY"
        />
        <Field
          label="Código postal"
          name="address_postal_code"
          defaultValue={tenant.address_postal_code ?? ""}
          placeholder="82801"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="address_country">País</Label>
          <select
            id="address_country"
            name="address_country"
            defaultValue={tenant.address_country ?? ""}
            className={selectCls}
          >
            <option value="">— Sin definir —</option>
            {COUNTRIES.map(([code, name]) => (
              <option key={code} value={code}>
                {name} ({code})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="invoice_default_currency">Moneda por defecto</Label>
          <select
            id="invoice_default_currency"
            name="invoice_default_currency"
            defaultValue={tenant.invoice_default_currency}
            className={selectCls}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="invoice_footer">Pie de página de las facturas</Label>
        <textarea
          id="invoice_footer"
          name="invoice_footer"
          defaultValue={tenant.invoice_footer ?? ""}
          rows={3}
          placeholder="Términos de pago, agradecimiento, datos bancarios alternativos…"
          className={cn(
            "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
            "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y",
          )}
        />
        <p className="text-xs text-muted-foreground">
          Aparece al final de cada factura. Útil para términos de pago,
          políticas de cancelación, o un agradecimiento.
        </p>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}

const selectCls = cn(
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
  "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
);

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
