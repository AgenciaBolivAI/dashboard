import Link from "next/link";
import { BarChart3, TrendingUp, Target, Trophy } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { getTenantBySlug } from "@/lib/tenant";
import { requirePermission } from "@/lib/auth";
import { getReports, REPORT_PERIODS, type ReportPeriod } from "@/lib/queries/reports";
import { AreaTrend } from "@/components/charts/area-trend";
import { ReportsToolbar } from "@/components/reports/reports-toolbar";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const STAGE_LABEL_KEY: Record<string, string> = {
  new: "status_label_new",
  contacted: "status_label_contacted",
  warm: "status_label_warm",
  converted: "status_label_converted",
};

const STAGE_BAR: Record<string, string> = {
  new: "bg-primary",
  contacted: "bg-yellow-500",
  warm: "bg-orange-500",
  converted: "bg-green-500",
};

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { tenantSlug } = await params;
  const { period: periodParam } = await searchParams;
  const tenant = await getTenantBySlug(tenantSlug);
  await requirePermission(tenant.id, "reports", "read");
  const t = await getTranslations("reports");
  const tl = await getTranslations("leads");
  const locale = await getLocale();

  const period = (REPORT_PERIODS.includes(periodParam as ReportPeriod)
    ? periodParam
    : "30d") as ReportPeriod;
  const currency = tenant.invoice_default_currency;
  const data = await getReports(tenant.id, period, currency);

  const money = (c: number) => formatMoney(c, currency, locale);
  const maxStageValue = Math.max(1, ...data.pipelineByStage.map((s) => s.value_cents));

  const PERIOD_LABEL: Record<ReportPeriod, string> = {
    "7d": t("period_7d"),
    "30d": t("period_30d"),
    "90d": t("period_90d"),
    all: t("period_all"),
  };

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight flex items-center gap-2">
            <BarChart3 className="size-7 text-primary" />
            {t("page_title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t("page_subtitle")}</p>
        </div>
        <ReportsToolbar data={data} />
      </div>

      {/* Period selector */}
      <div className="mb-6 flex gap-1.5 flex-wrap print:hidden">
        {REPORT_PERIODS.map((p) => (
          <Link
            key={p}
            href={`/dashboard/${tenantSlug}/reports?period=${p}`}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition",
              p === period
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
            )}
          >
            {PERIOD_LABEL[p]}
          </Link>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi icon={<Target className="size-4" />} label={t("kpi_total_leads")} value={String(data.totalLeads)} />
        <Kpi
          icon={<TrendingUp className="size-4" />}
          label={t("kpi_conversion_rate")}
          value={data.conversionRatePct == null ? "—" : `${data.conversionRatePct}%`}
        />
        <Kpi
          icon={<BarChart3 className="size-4" />}
          label={t("kpi_weighted_forecast")}
          value={money(data.weightedForecastCents)}
          sub={t("kpi_weighted_forecast_sub", { value: money(data.openPipelineCents) })}
        />
        <Kpi
          icon={<Trophy className="size-4" />}
          label={t("kpi_won")}
          value={money(data.wonValueCents)}
          accent="text-green-600"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        {/* Funnel */}
        <Card>
          <CardContent className="pt-5">
            <h2 className="font-display font-bold mb-4">{t("funnel_title")}</h2>
            <div className="space-y-3">
              {data.funnel.map((f) => (
                <div key={f.status}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{tl(STAGE_LABEL_KEY[f.status] ?? f.status)}</span>
                    <span className="text-muted-foreground">
                      {f.count} · {f.pct}%
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", STAGE_BAR[f.status] ?? "bg-primary")}
                      style={{ width: `${Math.max(2, f.pct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-4">{t("funnel_hint")}</p>
          </CardContent>
        </Card>

        {/* Pipeline value by stage */}
        <Card>
          <CardContent className="pt-5">
            <h2 className="font-display font-bold mb-4">{t("pipeline_title")}</h2>
            <div className="space-y-3">
              {data.pipelineByStage.map((s) => (
                <div key={s.status}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{tl(STAGE_LABEL_KEY[s.status] ?? s.status)}</span>
                    <span className="text-muted-foreground">{money(s.value_cents)}</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", STAGE_BAR[s.status] ?? "bg-primary")}
                      style={{ width: `${Math.max(2, Math.round((s.value_cents / maxStageValue) * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-sm mt-4 pt-3 border-t border-border flex justify-between">
              <span className="text-muted-foreground">{t("pipeline_open_total")}</span>
              <span className="font-display font-bold">{money(data.openPipelineCents)}</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue trend */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-display font-bold">{t("revenue_title")}</h2>
            <span className="text-sm text-muted-foreground">{money(data.revenueTotalCents)}</span>
          </div>
          {data.revenueTrend.length > 0 ? (
            <AreaTrend data={data.revenueTrend} locale={locale} valueLabel={currency} />
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">{t("revenue_empty")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wider">
          {icon}
          {label}
        </div>
        <p className={cn("text-2xl font-display font-extrabold mt-1.5", accent)}>{value}</p>
        {sub ? <p className="text-xs text-muted-foreground mt-0.5">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}
