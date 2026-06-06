import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  FileText,
  Mail,
  Phone,
  Star,
  Video,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTenantBySlug } from "@/lib/tenant";
import { getCustomer360 } from "@/lib/queries/customers";
import { formatMoney } from "@/lib/format";
import { CustomerProfileForm } from "./customer-profile-form";

const RESV_STATUS: Record<
  string,
  { label: string; variant: "default" | "outline" | "success" | "destructive" }
> = {
  confirmed: { label: "Confirmada", variant: "success" },
  pending: { label: "Pendiente", variant: "outline" },
  completed: { label: "Completada", variant: "default" },
  cancelled: { label: "Cancelada", variant: "outline" },
  no_show: { label: "No-show", variant: "destructive" },
};

const INV_STATUS: Record<
  string,
  { label: string; variant: "default" | "outline" | "success" | "destructive" }
> = {
  draft: { label: "Borrador", variant: "outline" },
  open: { label: "Enviada", variant: "default" },
  paid: { label: "Pagada", variant: "success" },
  past_due: { label: "Vencida", variant: "destructive" },
  void: { label: "Anulada", variant: "outline" },
  uncollectible: { label: "Incobrable", variant: "destructive" },
};

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; userId: string }>;
}) {
  const { tenantSlug, userId } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  const customer = await getCustomer360(tenant.id, userId);
  if (!customer) notFound();

  // Pick a representative currency from the customer's invoices, or fall
  // back to the tenant default.
  const currency =
    customer.invoices[0]?.currency ?? tenant.invoice_default_currency;

  return (
    <div className="p-6 md:p-8 max-w-6xl space-y-6">
      <div>
        <Link
          href={`/dashboard/${tenantSlug}/customers`}
          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <ArrowLeft className="size-3" />
          Volver a clientes
        </Link>
        <h1 className="text-3xl font-display font-extrabold tracking-tight mt-2 flex items-center gap-3 flex-wrap">
          {customer.name ?? "Cliente sin nombre"}
          {customer.is_vip ? (
            <Badge variant="success">
              <Star className="size-3 mr-1" />
              VIP
            </Badge>
          ) : null}
        </h1>
        <div className="text-sm text-muted-foreground mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {customer.whatsapp_number ? (
            <a
              href={`https://wa.me/${customer.whatsapp_number.replace(/[^\d]/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <Phone className="size-3" />+{customer.whatsapp_number}
            </a>
          ) : null}
          {customer.email ? (
            <a
              href={`mailto:${customer.email}`}
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <Mail className="size-3" />
              {customer.email}
            </a>
          ) : null}
          <span>
            Cliente desde{" "}
            {new Date(customer.created_at).toLocaleDateString("es")}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          label="Reservas"
          value={customer.reservations.length.toLocaleString("es")}
        />
        <Stat
          label="Total gastado"
          value={formatMoney(customer.lifetime_spend_cents, currency)}
        />
        <Stat
          label="Pendiente"
          value={formatMoney(customer.outstanding_cents, currency)}
        />
        <Stat
          label="Suscripciones"
          value={customer.active_subscriptions.toLocaleString("es")}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="size-4" />
                Reservas ({customer.reservations.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {customer.reservations.length === 0 ? (
                <p className="text-sm text-muted-foreground px-6 pb-6">
                  Aún no tiene reservas.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-2">Fecha</th>
                      <th className="text-left px-4 py-2">Servicio</th>
                      <th className="text-left px-4 py-2">Estado</th>
                      <th className="text-right px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {customer.reservations.map((r) => {
                      const s = RESV_STATUS[r.status] ?? {
                        label: r.status,
                        variant: "outline" as const,
                      };
                      return (
                        <tr
                          key={r.id}
                          className="border-t border-border hover:bg-secondary/30"
                        >
                          <td className="px-4 py-2">
                            {new Date(r.start_at).toLocaleString("es", {
                              timeZone: tenant.timezone,
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}{" "}
                            <span className="text-muted-foreground text-xs">
                              · {r.duration_minutes}m
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            {r.service_name ?? (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <Badge variant={s.variant}>{s.label}</Badge>
                          </td>
                          <td className="px-4 py-2 text-right">
                            {r.meeting_url ? (
                              <a
                                href={r.meeting_url}
                                target="_blank"
                                rel="noreferrer"
                                title="Abrir videollamada"
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <Video className="size-4 inline" />
                              </a>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="size-4" />
                Facturas ({customer.invoices.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {customer.invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground px-6 pb-6">
                  Aún no se le emitió ninguna factura.
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-2">Número</th>
                      <th className="text-left px-4 py-2">Estado</th>
                      <th className="text-right px-4 py-2">Total</th>
                      <th className="text-left px-4 py-2">Creada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customer.invoices.map((inv) => {
                      const s = INV_STATUS[inv.status] ?? {
                        label: inv.status,
                        variant: "outline" as const,
                      };
                      return (
                        <tr
                          key={inv.id}
                          className="border-t border-border hover:bg-secondary/30"
                        >
                          <td className="px-4 py-2 font-mono text-xs">
                            <Link
                              href={`/dashboard/${tenantSlug}/invoices/${inv.id}`}
                              className="hover:underline"
                            >
                              {inv.number ?? "(borrador)"}
                            </Link>
                          </td>
                          <td className="px-4 py-2">
                            <Badge variant={s.variant}>{s.label}</Badge>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {formatMoney(inv.total_cents, inv.currency)}
                          </td>
                          <td className="px-4 py-2 text-muted-foreground">
                            {new Date(inv.created_at).toLocaleDateString("es")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notas internas</CardTitle>
              <CardDescription>
                Privadas para tu equipo. El agente NO las ve.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CustomerProfileForm
                tenantId={tenant.id}
                userId={customer.id}
                isVip={customer.is_vip}
                tenantNotes={customer.tenant_notes}
              />
            </CardContent>
          </Card>

          {customer.facts ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notas del agente</CardTitle>
                <CardDescription>
                  Lo que el agente ha aprendido del cliente — sí se inyecta en
                  el prompt.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                  {customer.facts}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs text-muted-foreground uppercase tracking-wider">
          {label}
        </p>
        <p className="mt-1 text-xl font-display font-extrabold tracking-tight">
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
