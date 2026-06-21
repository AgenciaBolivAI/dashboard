import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Plus, FileText, ExternalLink, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getTenantBySlug } from "@/lib/tenant";
import { listInvoices, countInvoices, getInvoiceSummary } from "@/lib/queries/invoices";
import { lookupUserIdsByPhones } from "@/lib/queries/user-lookup";
import { RealtimeSearch } from "@/components/ui/realtime-search";
import { Pagination } from "@/components/ui/pagination";
import { clampPageSize } from "@/lib/pagination";
import { formatMoney } from "@/lib/format";

export default async function InvoicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ status?: string; q?: string; page?: string; pageSize?: string }>;
}) {
  const { tenantSlug } = await params;
  const { status: statusFilter, q, page: pageParam, pageSize: pageSizeParam } = await searchParams;
  const tenant = await getTenantBySlug(tenantSlug);
  const status = (statusFilter ?? "all") as NonNullable<Parameters<typeof listInvoices>[1]>["status"];
  const t = await getTranslations("invoices");

  const search = q?.trim() || undefined;
  const pageSize = clampPageSize(Number(pageSizeParam), 50);
  const page = Math.max(1, Number(pageParam) || 1);
  const offset = (page - 1) * pageSize;

  const STATUS_LABEL: Record<string, { label: string; variant: "default" | "outline" | "success" | "destructive" }> = {
    draft: { label: t("status_draft"), variant: "outline" },
    open: { label: t("status_open"), variant: "default" },
    paid: { label: t("status_paid"), variant: "success" },
    past_due: { label: t("status_past_due"), variant: "destructive" },
    void: { label: t("status_void"), variant: "outline" },
    uncollectible: { label: t("status_uncollectible"), variant: "destructive" },
  };

  const [invoices, total, summary] = await Promise.all([
    listInvoices(tenant.id, { status, search, limit: pageSize, offset }),
    countInvoices(tenant.id, { status, search }),
    getInvoiceSummary(tenant.id, tenant.invoice_default_currency),
  ]);

  // Resolve user IDs for the customer_phone of each invoice so the customer
  // name in the table can link directly to /customers/[user_id].
  const userIdByPhone = await lookupUserIdsByPhones(
    tenant.id,
    invoices.map((inv) => inv.customer_phone),
  );

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("subtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <a
              href={`/api/invoices/export?tenant_id=${tenant.id}${
                statusFilter ? `&status=${statusFilter}` : ""
              }`}
              title={t("csv_summary_tooltip")}
            >
              <Download className="size-4" />
              {t("csv_summary")}
            </a>
          </Button>
          <Button asChild variant="outline">
            <a
              href={`/api/invoices/export?tenant_id=${tenant.id}&detailed=1${
                statusFilter ? `&status=${statusFilter}` : ""
              }`}
              title={t("csv_detailed_tooltip")}
            >
              <Download className="size-4" />
              {t("csv_detailed")}
            </a>
          </Button>
          <Button asChild>
            <Link href={`/dashboard/${tenantSlug}/invoices/new`}>
              <Plus className="size-4" />
              {t("new_invoice")}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <SummaryCard
          label={t("summary_paid")}
          value={formatMoney(summary.paid_cents, summary.currency)}
          sub={t("summary_paid_sub", { count: summary.count_paid })}
        />
        <SummaryCard
          label={t("summary_pending")}
          value={formatMoney(summary.outstanding_cents, summary.currency)}
          sub={t("summary_pending_sub", { count: summary.count_open + summary.count_past_due })}
        />
        <SummaryCard
          label={t("summary_total_issued")}
          value={String(summary.count_total)}
          sub={t("summary_total_issued_sub")}
        />
        <SummaryCard
          label={t("summary_main_currency")}
          value={summary.currency}
          sub={t("summary_main_currency_sub")}
        />
      </div>

      <div className="flex gap-1 border-b border-border mb-4">
        {[
          { v: "all", label: t("tab_all") },
          { v: "draft", label: t("tab_drafts") },
          { v: "open", label: t("tab_sent") },
          { v: "past_due", label: t("tab_past_due") },
          { v: "paid", label: t("tab_paid") },
          { v: "recurring", label: t("tab_subscriptions") },
        ].map((tab) => {
          const isActive = (statusFilter ?? "all") === tab.v;
          const sp = new URLSearchParams();
          if (tab.v !== "all") sp.set("status", tab.v);
          if (search) sp.set("q", search);
          const qs = sp.toString();
          const href = `/dashboard/${tenantSlug}/invoices${qs ? "?" + qs : ""}`;
          return (
            <Link
              key={tab.v}
              href={href}
              className={
                "px-3 py-2 text-sm border-b-2 -mb-px " +
                (isActive
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground")
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      <div className="mb-4">
        <RealtimeSearch placeholder={t("search_placeholder")} />
      </div>

      {invoices.length === 0 ? (
        <Card className="py-16 flex flex-col items-center text-center">
          <FileText className="size-10 text-muted-foreground mb-4" />
          <p className="font-medium">{t("empty_title")}</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            {t("empty_subtitle")}
          </p>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3">{t("col_number")}</th>
                  <th className="text-left px-4 py-3">{t("col_customer")}</th>
                  <th className="text-left px-4 py-3">{t("col_status")}</th>
                  <th className="text-right px-4 py-3">{t("col_total")}</th>
                  <th className="text-left px-4 py-3">{t("col_due")}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const s = STATUS_LABEL[inv.status] ?? { label: inv.status, variant: "outline" as const };
                  const phoneKey = inv.customer_phone?.replace(/\D/g, "") ?? "";
                  const userId = userIdByPhone[phoneKey];
                  return (
                    <tr key={inv.id} className="border-t border-border hover:bg-secondary/30">
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link
                          href={`/dashboard/${tenantSlug}/invoices/${inv.id}`}
                          className="hover:underline"
                        >
                          {inv.number ?? t("draft_placeholder")}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        {inv.customer_name ? (
                          userId ? (
                            <Link
                              href={`/dashboard/${tenantSlug}/customers/${userId}`}
                              className="hover:text-primary hover:underline"
                            >
                              {inv.customer_name}
                            </Link>
                          ) : (
                            inv.customer_name
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {inv.is_recurring ? (
                          <span className="ml-2 text-[10px] text-muted-foreground uppercase">
                            {t("recurring_badge")}
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
                            title={t("view_in_stripe")}
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

      {total > 0 ? <Pagination total={total} defaultPageSize={50} className="mt-4" /> : null}
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
