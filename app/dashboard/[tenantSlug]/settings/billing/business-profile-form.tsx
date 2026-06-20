"use client";

import { useActionState, useEffect } from "react";
import { useTranslations, useLocale } from "next-intl";
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

const COUNTRY_CODES = [
  "US", "CA", "MX", "BR", "AR", "CL", "CO", "PE", "EC", "VE", "BO",
  "UY", "PY", "PA", "CR", "DO", "GT", "HN", "SV", "NI", "PR",
  "ES", "PT", "GB", "FR", "DE", "IT", "NL", "IE",
  "AU", "NZ", "JP", "SG", "IN",
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
  const t = useTranslations("settings_billing");
  const locale = useLocale();
  const [state, action, pending] = useActionState(
    updateBusinessProfileAction,
    initial,
  );

  const regionNames = new Intl.DisplayNames([locale], { type: "region" });
  const countries = COUNTRY_CODES.map(
    (code) => [code, regionNames.of(code) ?? code] as const,
  ).sort((a, b) => a[1].localeCompare(b[1], locale));

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) toast.success(t("toast_data_saved"));
  }, [state, t]);

  return (
    <form action={action} className="space-y-5 max-w-2xl">
      <input type="hidden" name="tenant_id" value={tenant.id} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field
          label={t("field_legal_name")}
          name="legal_name"
          defaultValue={tenant.legal_name ?? ""}
          placeholder="BolivAI LLC"
        />
        <Field
          label={t("field_tax_id")}
          name="tax_id"
          defaultValue={tenant.tax_id ?? ""}
          placeholder="EIN, RFC, NIT, CUIT, VAT…"
        />
      </div>

      <Field
        label={t("field_address_line1")}
        name="address_line1"
        defaultValue={tenant.address_line1 ?? ""}
        placeholder="30 N Gould St Ste R"
      />
      <Field
        label={t("field_address_line2")}
        name="address_line2"
        defaultValue={tenant.address_line2 ?? ""}
        placeholder={t("address_line2_placeholder")}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Field
          label={t("field_city")}
          name="address_city"
          defaultValue={tenant.address_city ?? ""}
          placeholder="Sheridan"
        />
        <Field
          label={t("field_state")}
          name="address_state"
          defaultValue={tenant.address_state ?? ""}
          placeholder="WY"
        />
        <Field
          label={t("field_postal_code")}
          name="address_postal_code"
          defaultValue={tenant.address_postal_code ?? ""}
          placeholder="82801"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="address_country">{t("field_country")}</Label>
          <select
            id="address_country"
            name="address_country"
            defaultValue={tenant.address_country ?? ""}
            className={selectCls}
          >
            <option value="">{t("country_unset")}</option>
            {countries.map(([code, name]) => (
              <option key={code} value={code}>
                {name} ({code})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="invoice_default_currency">{t("field_default_currency")}</Label>
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
        <Label htmlFor="invoice_footer">{t("field_invoice_footer")}</Label>
        <textarea
          id="invoice_footer"
          name="invoice_footer"
          defaultValue={tenant.invoice_footer ?? ""}
          rows={3}
          placeholder={t("invoice_footer_placeholder")}
          className={cn(
            "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
            "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y",
          )}
        />
        <p className="text-xs text-muted-foreground">
          {t("invoice_footer_hint")}
        </p>
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("save_changes")}
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
