import Link from "next/link";
import { Plus, FileText, ExternalLink, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getTenantBySlug } from "@/lib/tenant";
import { listInvoices, getInvoiceSummary } from "@/lib/queries/invoices";
import { formatMoney } from "@/lib/format";

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "outline" | "success" | "destructive" }> = {
  draft: { label: "Borrador", variant: "outline" },
  open: { label: "Enviada", variant: "default" },
  paid: { label: "Pagada", variant: "success" },
  past_due: { label: "Vencida", variant: "destructive" },
  void: { label: "Anulada", variant: "outline" },
  uncollectible: { label: "Incobrable", variant: "destructive" },
};

export default async function InvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { tenantSlug } = await params;
  const { status: statusFilter } = await searchParams;
  const tenant = await getTenantBySlug(tenantSlug);
  const status = (statusFilter ?? "all") as NonNullable<Parameters<typeof listInvoices>[1]>["status"];

  const [invoices, summary] = await Promise.all([
    listInvoices(tenant.id, { status }),
    getInvoiceSummary(tenant.id, tenant.invoice_default_currency),
  ]);

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">Facturas</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Emite, envía y cobra facturas a tus clientes.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <a
              href={`/api/invoices/export?tenant_id=${tenant.id}${
                statusFilter ? `&status=${statusFilter}` : ""
              }`}
              title="Una fila por factura (resumen)"
            >
              <Download className="size-4" />
              CSV resumen
            </a>
          </Button>
          <Button asChild variant="outline">
            <a
              href={`/api/invoices/export?tenant_id=${tenant.id}&detailed=1${
                statusFilter ? `&status=${statusFilter}` : ""
              }`}
              title="Una fila por línea de factura, con desglose de IVA"
            >
              <Download className="size-4" />
              CSV detallado
            </a>
          </Button>
          <Button asChild>
            <Link href={`/dashboard/${tenantSlug}/invoices/new`}>
              <Plus className="size-4" />
              Nueva factura
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryCard
          label="Pagadas"
          value={formatMoney(summary.paid_cents, summary.currency)}
          sub={`${summary.count_paid} facturas`}
        />
        <SummaryCard
          label="Pendientes"
          value={formatMoney(summary.outstanding_cents, summary.currency)}
          sub={`${summary.count_open + summary.count_past_due} sin cobrar`}
        />
        <SummaryCard label="Total emitidas" value={String(summary.count_total)} sub="todas las monedas" />
        <SummaryCard
          label="Moneda principal"
          value={summary.currency}
          sub="cambiar en Ajustes → Facturación"
        />
      </div>

      <div className="flex gap-1 border-b border-border mb-4">
        {[
          { v: "all", label: "Todas" },
          { v: "draft", label: "Borradores" },
          { v: "open", label: "Enviadas" },
          { v: "past_due", label: "Vencidas" },
          { v: "paid", label: "Pagadas" },
          { v: "recurring", label: "Suscripciones" },
        ].map((t) => {
          const isActive = (statusFilter ?? "all") === t.v;
          const href =
            t.v === "all"
              ? `/dashboard/${tenantSlug}/invoices`
              : `/dashboard/${tenantSlug}/invoices?status=${t.v}`;
          return (
            <Link
              key={t.v}
              href={href}
              className={
                "px-3 py-2 text-sm border-b-2 -mb-px " +
                (isActive
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {invoices.length === 0 ? (
        <Card className="py-16 flex flex-col items-center text-center">
          <FileText className="size-10 text-muted-foreground mb-4" />
          <p className="font-medium">Aún no hay facturas en esta vista</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            Crea una factura desde aquí o desde el detalle de una reserva en el calendario.
          </p>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3">Número</th>
                  <th className="text-left px-4 py-3">Cliente</th>
                  <th className="text-left px-4 py-3">Estado</th>
                  <th className="text-right px-4 py-3">Total</th>
                  <th className="text-left px-4 py-3">Vence</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const s = STATUS_LABEL[inv.status] ?? { label: inv.status, variant: "outline" as const };
                  return (
                    <tr key={inv.id} className="border-t border-border hover:bg-secondary/30">
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link
                          href={`/dashboard/${tenantSlug}/invoices/${inv.id}`}
                          className="hover:underline"
                        >
                          {inv.number ?? "(borrador)"}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {inv.customer_name ?? <span className="text-muted-foreground">—</span>}
                        {inv.is_recurring ? (
                          <span className="ml-2 text-[10px] text-muted-foreground uppercase">
                            recurrente
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoney(inv.total_cents, inv.currency)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {inv.due_date ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {inv.stripe_payment_link ? (
                          <a
                            href={inv.stripe_payment_link}
                            target="_blank"
                            rel="noreferrer"
                            className="text-muted-foreground hover:text-foreground"
                            title="Ver en Stripe"
                          >
                            <ExternalLink className="size-4 inline" />
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-xl font-display font-extrabold mt-1">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}
