import { getTranslations } from "next-intl/server";
import { getTenantBySlug } from "@/lib/tenant";
import { createClient } from "@/lib/supabase/server";
import { InvoiceEditor } from "@/components/invoices/invoice-editor";

export default async function NewInvoicePage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  const t = await getTranslations("invoices");

  const supabase = await createClient();
  const { data: services } = await supabase
    .from("services")
    .select("id, name, price_amount, price_currency, duration_min")
    .eq("tenant_id", tenant.id)
    .eq("active", true)
    .order("name");

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <h1 className="text-3xl font-display font-extrabold tracking-tight mb-6">
        {t("new_invoice")}
      </h1>
      <InvoiceEditor
        tenant={{
          id: tenant.id,
          slug: tenant.slug,
          invoice_default_currency: tenant.invoice_default_currency,
          stripe_account_id: tenant.stripe_account_id,
          stripe_charges_enabled: tenant.stripe_charges_enabled,
        }}
        services={(services ?? []) as Array<{
          id: string;
          name: string;
          price_amount: number | null;
          price_currency: string | null;
          duration_min: number | null;
        }>}
        invoice={null}
        items={[]}
      />
    </div>
  );
}
