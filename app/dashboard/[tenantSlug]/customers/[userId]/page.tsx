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
import { getTranslations } from "next-intl/server";
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

type StatusVariant = "default" | "outline" | "success" | "destructive";

const RESV_STATUS_VARIANT: Record<string, StatusVariant> = {
  confirmed: "success",
  pending: "outline",
  completed: "default",
  cancelled: "outline",
  no_show: "destructive",
};

const INV_STATUS_VARIANT: Record<string, StatusVariant> = {
  draft: "outline",
  open: "default",
  paid: "success",
  past_due: "destructive",
  void: "outline",
  uncollectible: "destructive",
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
  const t = await getTranslations("customers");

  const RESV_STATUS: Record<string, { label: string; variant: StatusVariant }> = {
    confirmed: { label: t("resv_confirmed"), variant: RESV_STATUS_VARIANT.confirmed },
    pending: { label: t("resv_pending"), variant: RESV_STATUS_VARIANT.pending },
    completed: { label: t("resv_completed"), variant: RESV_STATUS_VARIANT.completed },
    cancelled: { label: t("resv_cancelled"), variant: RESV_STATUS_VARIANT.cancelled },
    no_show: { label: t("resv_no_show"), variant: RESV_STATUS_VARIANT.no_show },
  };

  const INV_STATUS: Record<string, { label: string; variant: StatusVariant }> = {
    draft: { label: t("inv_draft"), variant: INV_STATUS_VARIANT.draft },
    open: { label: t("inv_open"), variant: INV_STATUS_VARIANT.open },
    paid: { label: t("inv_paid"), variant: INV_STATUS_VARIANT.paid },
    past_due: { label: t("inv_past_due"), variant: INV_STATUS_VARIANT.past_due },
    void: { label: t("inv_void"), variant: INV_STATUS_VARIANT.void },
    uncollectible: { label: t("inv_uncollectible"), variant: INV_STATUS_VARIANT.uncollectible },
  };

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
          {t("back_to_customers")}
        </Link>
        <h1 className="text-3xl font-display font-extrabold tracking-tight mt-2 flex items-center gap-3 flex-wrap">
          {customer.name ?? t("unnamed_customer")}
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
            {t("customer_since", {
              date: new Date(customer.created_at).toLocaleDateString("es"),
            })}
          </span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          label={t("stat_reservations")}
          value={customer.reservations.length.toLocaleString("es")}
        />
        <Stat
          label={t("stat_total_spent")}
          value={formatMoney(customer.lifetime_spend_cents, currency)}
        />
        <Stat
          label={t("stat_outstanding")}
          value={formatMoney(customer.outstanding_cents, currency)}
        />
        <Stat
          label={t("stat_subscriptions")}
          value={customer.active_subscriptions.toLocaleString("es")}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="size-4" />
                {t("reservations_title", { count: customer.reservations.length })}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {customer.reservations.length === 0 ? (
                <p className="text-sm text-muted-foreground px-6 pb-6">
                  {t("no_reservations_yet")}
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-2">{t("col_date")}</th>
                      <th className="text-left px-4 py-2">{t("col_service")}</th>
                      <th className="text-left px-4 py-2">{t("col_status")}</th>
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
                                title={t("open_video_call")}
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
                {t("invoices_title", { count: customer.invoices.length })}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {customer.invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground px-6 pb-6">
                  {t("no_invoices_yet")}
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-2">{t("col_number")}</th>
                      <th className="text-left px-4 py-2">{t("col_status")}</th>
                      <th className="text-right px-4 py-2">{t("col_total")}</th>
                      <th className="text-left px-4 py-2">{t("col_created")}</th>
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
                              {inv.number ?? t("draft_fallback")}
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
              <CardTitle className="text-base">{t("internal_notes_title")}</CardTitle>
              <CardDescription>
                {t("internal_notes_desc")}
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
                <CardTitle className="text-base">{t("agent_notes_title")}</CardTitle>
                <CardDescription>
                  {t("agent_notes_desc")}
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
