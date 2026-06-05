import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLink, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTenantBySlug } from "@/lib/tenant";
import { getInvoice } from "@/lib/queries/invoices";
import { createClient } from "@/lib/supabase/server";
import { InvoiceEditor } from "@/components/invoices/invoice-editor";
import { InvoiceActions } from "@/components/invoices/invoice-actions";
import { formatMoney } from "@/lib/format";

const STATUS: Record<string, { label: string; variant: "default" | "outline" | "success" | "destructive" }> = {
  draft: { label: "Borrador", variant: "outline" },
  open: { label: "Enviada", variant: "default" },
  paid: { label: "Pagada", variant: "success" },
  past_due: { label: "Vencida", variant: "destructive" },
  void: { label: "Anulada", variant: "outline" },
  uncollectible: { label: "Incobrable", variant: "destructive" },
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; invoiceId: string }>;
}) {
  const { tenantSlug, invoiceId } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  const result = await getInvoice(tenant.id, invoiceId);
  if (!result) notFound();

  const { invoice, items } = result;
  const isDraft = invoice.status === "draft";
  const s = STATUS[invoice.status] ?? { label: invoice.status, variant: "outline" as const };

  if (isDraft) {
    const supabase = await createClient();
    const { data: services } = await supabase
      .from("services")
      .select("id, name, price_amount, price_currency, duration_min")
      .eq("tenant_id", tenant.id)
      .eq("active", true)
      .order("name");

    return (
      <div className="p-6 md:p-8 max-w-4xl">
        <div className="mb-6 flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-display font-extrabold tracking-tight">
              Editar borrador
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Cuando esté listo, pulsa "Enviar". Después no podrás editar.
            </p>
          </div>
          <Badge variant={s.variant}>{s.label}</Badge>
        </div>
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
          invoice={invoice}
          items={items}
        />
      </div>
    );
  }

  // Read-only view for sent / paid / void
  return (
    <div className="p-6 md:p-8 max-w-4xl space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">
            Factura {invoice.number ?? "(sin número)"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {invoice.customer_name ?? "Cliente"} ·{" "}
            {invoice.sent_at ? `Enviada ${new Date(invoice.sent_at).toLocaleDateString("es")}` : ""}
          </p>
        </div>
        <Badge variant={s.variant}>{s.label}</Badge>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <Field label="Cliente" value={invoice.customer_name ?? "—"} />
            <Field label="Email" value={invoice.customer_email ?? "—"} />
            <Field label="Teléfono" value={invoice.customer_phone ?? "—"} />
            <Field label="Vence" value={invoice.due_date ?? "—"} />
          </div>

          <table className="w-full text-sm border-t border-border pt-4">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left py-2">Descripción</th>
                <th className="text-right py-2">Cant.</th>
                <th className="text-right py-2">Precio</th>
                <th className="text-right py-2">Importe</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-border">
                  <td className="py-2">{it.description}</td>
                  <td className="py-2 text-right tabular-nums">{it.quantity}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatMoney(it.unit_price_cents, invoice.currency)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {formatMoney(it.amount_cents, invoice.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border">
              <tr>
                <td colSpan={3} className="text-right py-2 text-muted-foreground">Subtotal</td>
                <td className="text-right py-2 tabular-nums">{formatMoney(invoice.subtotal_cents, invoice.currency)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="text-right py-1 text-muted-foreground">Impuestos</td>
                <td className="text-right py-1 tabular-nums">{formatMoney(invoice.tax_cents, invoice.currency)}</td>
              </tr>
              <tr>
                <td colSpan={3} className="text-right py-2 font-medium">Total</td>
                <td className="text-right py-2 font-medium tabular-nums">{formatMoney(invoice.total_cents, invoice.currency)}</td>
              </tr>
              {invoice.amount_paid_cents > 0 ? (
                <tr>
                  <td colSpan={3} className="text-right py-1 text-muted-foreground flex justify-end items-center gap-1">
                    <CheckCircle2 className="size-3 text-primary" /> Pagado
                  </td>
                  <td className="text-right py-1 tabular-nums text-primary">{formatMoney(invoice.amount_paid_cents, invoice.currency)}</td>
                </tr>
              ) : null}
            </tfoot>
          </table>

          {invoice.notes ? (
            <div className="text-xs text-muted-foreground border-t border-border pt-3 whitespace-pre-wrap">
              {invoice.notes}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex gap-2 flex-wrap">
        {invoice.stripe_payment_link ? (
          <Button asChild variant="outline">
            <a href={invoice.stripe_payment_link} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              Ver página de pago
            </a>
          </Button>
        ) : null}
        <InvoiceActions tenantId={tenant.id} invoice={invoice} />
      </div>

      <p className="text-xs text-muted-foreground">
        <Link href={`/dashboard/${tenantSlug}/invoices`} className="hover:underline">
          ← Volver a la lista
        </Link>
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5">{value}</p>
    </div>
  );
}
