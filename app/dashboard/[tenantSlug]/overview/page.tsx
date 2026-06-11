import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTenantBySlug } from "@/lib/tenant";
import { getPlan, isOverConversationsCap } from "@/lib/plans";
import { getTenantOverviewMetrics } from "@/lib/queries/metrics";
import { getRevenueSummary } from "@/lib/queries/invoices";
import { formatMoney } from "@/lib/format";

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  const plan = getPlan(tenant.plan);
  const [m, revenue, t, locale] = await Promise.all([
    getTenantOverviewMetrics(tenant.id),
    getRevenueSummary(tenant.id, tenant.invoice_default_currency),
    getTranslations("overview"),
    getLocale(),
  ]);

  const overCap = isOverConversationsCap(plan, m.conversations);
  // Use BCP-47-ish locale for number formatting so "1,234" vs "1.234"
  // matches the active language. Spanish + Italian use "1.234", English uses "1,234", etc.
  const numFmt = (n: number) => n.toLocaleString(locale);
  const capDisplay =
    plan.conversationsCap === -1 ? "∞" : numFmt(plan.conversationsCap);

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">
            {t("title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("plan_tag")} {plan.name} · {tenant.industry ?? "general"} · {tenant.language}
          </p>
        </div>
        {overCap ? (
          <Badge variant="warning">Cap</Badge>
        ) : null}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={t("metric_conversations_month")}
          value={numFmt(m.conversations)}
          hint={
            plan.conversationsCap === -1
              ? "∞"
              : `${numFmt(m.conversations)} / ${capDisplay}`
          }
        />
        <KpiCard
          label={t("metric_leads_captured")}
          value={numFmt(m.leads)}
          hint={t("metric_leads_period")}
        />
        <KpiCard
          label={t("metric_reservations_confirmed")}
          value={numFmt(m.reservations)}
          hint={t("metric_reservations_period")}
        />
        <KpiCard
          label={t("metric_messages_processed")}
          value={numFmt(m.messages)}
          hint={t("metric_messages_period")}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={t("metric_charged_month")}
          value={formatMoney(revenue.paid_this_month_cents, revenue.currency)}
          hint={t("metric_charged_month_subtitle", { count: revenue.count_paid_this_month })}
        />
        <KpiCard
          label={t("metric_charged_ytd")}
          value={formatMoney(revenue.paid_ytd_cents, revenue.currency)}
          hint={t("metric_charged_ytd_subtitle", { year: new Date().getUTCFullYear() })}
        />
        <KpiCard
          label={t("metric_pending_charges")}
          value={formatMoney(revenue.outstanding_cents, revenue.currency)}
          hint={
            revenue.outstanding_cents > 0 ? (
              <Link
                href={`/dashboard/${tenantSlug}/invoices?status=open`}
                className="underline hover:text-foreground"
              >
                {t("metric_pending_charges")}
              </Link>
            ) : (
              t("metric_pending_charges_subtitle")
            )
          }
        />
        <KpiCard
          label={t("metric_active_subscriptions")}
          value={numFmt(revenue.active_subscriptions)}
          hint={
            revenue.active_subscriptions > 0 ? (
              <Link
                href={`/dashboard/${tenantSlug}/invoices?status=recurring`}
                className="underline hover:text-foreground"
              >
                {t("metric_active_subscriptions")}
              </Link>
            ) : (
              t("metric_active_subscriptions_zero")
            )
          }
        />
      </div>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>{t("next_steps_title")}</CardTitle>
          <CardDescription>{t("next_steps_intro")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="text-sm space-y-2 text-muted-foreground">
            <li>• {t("step_connect_evolution")}</li>
            <li>• {t("step_upload_kb")}</li>
            <li>• {t("step_define_staff")}</li>
            <li>• {t("step_personalize_prompt")}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 font-display text-3xl font-extrabold tracking-tight">
          {value}
        </p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
