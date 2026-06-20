import Link from "next/link";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Users,
  AlertTriangle,
  Activity,
} from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getPlatformPnl,
  getPlatformDailyTimeseries,
  getTenantPnlSummary,
  getActionBreakdown,
  fmtUsd,
  fmtCents,
  fmtCredits,
  type PnlWindow,
} from "@/lib/queries/admin-pnl";
import { Sparkline } from "@/components/admin/sparkline";
import { GrantCreditsPicker } from "@/components/admin/grant-credits-picker";
import { createServiceClient } from "@/lib/supabase/service";
import { Gift } from "lucide-react";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const tr = await getTranslations("admin_overview");
  const locale = await getLocale();

  const WINDOWS: { id: PnlWindow; label: string }[] = [
    { id: "today", label: tr("window_today") },
    { id: "week", label: tr("window_week") },
    { id: "month", label: tr("window_month") },
    { id: "30d", label: tr("window_30d") },
    { id: "90d", label: tr("window_90d") },
    { id: "all", label: tr("window_all") },
  ];

  const { window: windowParam } = await searchParams;
  const windowKey: PnlWindow =
    (WINDOWS.find((w) => w.id === windowParam)?.id ?? "month");

  const [pnl, timeseries, topTenants, actions] = await Promise.all([
    getPlatformPnl(windowKey),
    getPlatformDailyTimeseries(30),
    getTenantPnlSummary(windowKey),
    getActionBreakdown(windowKey),
  ]);

  // Every tenant (incl. brand-new ones with zero activity) for the credit gift
  // picker — admin-gated page, service client is fine.
  const { data: allTenants } = await createServiceClient()
    .from("tenants")
    .select("id, name, slug")
    .order("name");
  const tenantOptions = (allTenants ?? []) as { id: string; name: string; slug: string }[];

  const dailyRevenue = timeseries.map((d) => d.revenue_cents);
  const dailyCost = timeseries.map((d) => d.cost_micros / 1_000_000);
  const dailyMargin = timeseries.map((d) => d.margin_micros / 1_000_000);

  return (
    <div className="p-6 md:p-8 max-w-7xl">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">
            {tr("page_title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tr("page_subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {WINDOWS.map((w) => {
            const active = w.id === windowKey;
            return (
              <Link
                key={w.id}
                href={`/admin/overview?window=${w.id}`}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground",
                )}
              >
                {w.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* KPI Cards — 3 rows of context */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KpiCard
          icon={DollarSign}
          label={tr("kpi_revenue")}
          value={fmtCents(pnl?.topup_cents ?? 0)}
          subtitle={tr("kpi_revenue_sub")}
          color="text-green-600"
        />
        <KpiCard
          icon={TrendingDown}
          label={tr("kpi_api_cost")}
          value={fmtUsd(pnl?.cost_micros ?? 0)}
          subtitle="OpenAI · ElevenLabs · Twilio · Apollo · Instantly"
          color="text-amber-600"
        />
        <KpiCard
          icon={PiggyBank}
          label={tr("kpi_gross_margin")}
          value={fmtUsd(pnl?.margin_micros ?? 0)}
          subtitle={pnl?.margin_pct != null ? tr("kpi_margin_pct_sub", { pct: pnl.margin_pct }) : "—"}
          color="text-primary"
        />
        <KpiCard
          icon={TrendingUp}
          label={tr("kpi_usage_credits")}
          value={fmtCredits(pnl?.usage_credits ?? 0)}
          subtitle={tr("kpi_usage_value_sub", { value: fmtCents((pnl?.usage_credits ?? 0)) })}
          color="text-purple-600"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <KpiCard
          icon={Users}
          label={tr("kpi_active_tenants")}
          value={String(pnl?.active_tenants ?? 0)}
          subtitle={tr("kpi_total_tenants_sub", { total: pnl?.total_tenants ?? 0 })}
          color="text-cyan-600"
        />
        <KpiCard
          icon={Activity}
          label={tr("kpi_low_balance")}
          value={String(pnl?.tenants_low_balance ?? 0)}
          subtitle={tr("kpi_low_balance_sub")}
          color="text-amber-600"
        />
        <KpiCard
          icon={AlertTriangle}
          label={tr("kpi_no_credits")}
          value={String(pnl?.tenants_at_zero ?? 0)}
          subtitle={tr("kpi_no_credits_sub")}
          color="text-destructive"
        />
        <KpiCard
          icon={DollarSign}
          label={tr("kpi_arpu")}
          value={
            (pnl?.active_tenants ?? 0) > 0
              ? fmtCents((pnl!.topup_cents ?? 0) / (pnl!.active_tenants || 1))
              : "—"
          }
          subtitle={tr("kpi_arpu_sub")}
          color="text-foreground"
        />
      </div>

      {/* Sparklines for last 30 days */}
      <Card className="p-5 mb-6">
        <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-3">
          {tr("last_30_days")}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <SparkBlock
            label={tr("spark_daily_revenue")}
            value={fmtCents(timeseries.reduce((a, d) => a + d.revenue_cents, 0))}
            points={dailyRevenue}
            color="text-green-600"
          />
          <SparkBlock
            label={tr("spark_daily_cost")}
            value={fmtUsd(timeseries.reduce((a, d) => a + d.cost_micros, 0))}
            points={dailyCost}
            color="text-amber-600"
          />
          <SparkBlock
            label={tr("spark_daily_margin")}
            value={fmtUsd(timeseries.reduce((a, d) => a + d.margin_micros, 0))}
            points={dailyMargin}
            color="text-primary"
          />
        </div>
      </Card>

      {/* Gift / grant credits to any tenant */}
      <Card className="mb-6">
        <div className="p-4 border-b">
          <h2 className="font-semibold flex items-center gap-2">
            <Gift className="size-4 text-primary" />
            {tr("grant_card_title")}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {tr("grant_card_desc")}
          </p>
        </div>
        <div className="p-4">
          <GrantCreditsPicker tenants={tenantOptions} />
        </div>
      </Card>

      {/* Top tenants by margin */}
      <Card className="mb-6">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-semibold">{tr("tenants_by_margin_title")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {tr("tenants_by_margin_sub")}
            </p>
          </div>
          <Link
            href="/admin"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {tr("see_all")}
          </Link>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("col_tenant")}</TableHead>
              <TableHead className="text-right">{tr("col_balance")}</TableHead>
              <TableHead className="text-right">{tr("col_revenue")}</TableHead>
              <TableHead className="text-right">{tr("col_usage")}</TableHead>
              <TableHead className="text-right">{tr("col_cost")}</TableHead>
              <TableHead className="text-right">{tr("col_margin")}</TableHead>
              <TableHead className="text-right">{tr("col_pct")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topTenants.slice(0, 8).map((t) => (
              <TableRow key={t.tenant_id}>
                <TableCell>
                  <div className="font-medium">{t.name}</div>
                  <div className="text-xs text-muted-foreground">
                    <Link
                      href={`/admin/tenants/${t.tenant_id}`}
                      className="hover:underline"
                    >
                      /{t.slug}
                    </Link>
                    {" · "}
                    <Badge variant="outline" className="text-[10px] py-0">
                      {t.status}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {fmtCents(t.balance_credits)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-green-600">
                  {t.revenue_cents > 0 ? fmtCents(t.revenue_cents) : "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {t.usage_credits > 0 ? fmtCents(t.usage_credits) : "—"}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-amber-600">
                  {t.cost_micros > 0 ? fmtUsd(t.cost_micros) : "—"}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-mono text-sm font-semibold",
                    t.margin_micros > 0 && "text-primary",
                    t.margin_micros < 0 && "text-destructive",
                  )}
                >
                  {t.margin_micros !== 0 ? fmtUsd(t.margin_micros) : "—"}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {t.margin_pct != null ? `${t.margin_pct}%` : "—"}
                </TableCell>
              </TableRow>
            ))}
            {topTenants.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                  {tr("empty_window")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Action breakdown */}
      <Card>
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-semibold">{tr("actions_title")}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {tr("actions_sub")}
            </p>
          </div>
          <Link
            href="/admin/usage"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {tr("see_details")}
          </Link>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("col_action")}</TableHead>
              <TableHead className="text-right">{tr("col_units")}</TableHead>
              <TableHead className="text-right">{tr("col_revenue")}</TableHead>
              <TableHead className="text-right">{tr("col_cost")}</TableHead>
              <TableHead className="text-right">{tr("col_margin")}</TableHead>
              <TableHead className="text-right">{tr("col_pct")}</TableHead>
              <TableHead className="text-right">{tr("col_tenants")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {actions.slice(0, 12).map((a) => (
              <TableRow key={a.action_key}>
                <TableCell className="font-mono text-xs">{a.action_key}</TableCell>
                <TableCell className="text-right font-mono text-sm">
                  {a.units.toLocaleString(locale)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-green-600">
                  {fmtCents(a.revenue_credits)}
                </TableCell>
                <TableCell className="text-right font-mono text-sm text-amber-600">
                  {fmtUsd(a.cost_micros)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-mono text-sm font-semibold",
                    a.margin_micros > 0 && "text-primary",
                    a.margin_micros < 0 && "text-destructive",
                  )}
                >
                  {fmtUsd(a.margin_micros)}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {a.margin_pct != null ? `${a.margin_pct}%` : "—"}
                </TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {a.unique_tenants}
                </TableCell>
              </TableRow>
            ))}
            {actions.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                  {tr("empty_usage")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  subtitle,
  color,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  subtitle?: string;
  color: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Icon className={cn("size-3.5", color)} />
        <span>{label}</span>
      </div>
      <p className={cn("text-2xl font-display font-bold", color)}>{value}</p>
      {subtitle && (
        <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
      )}
    </Card>
  );
}

function SparkBlock({
  label,
  value,
  points,
  color,
}: {
  label: string;
  value: string;
  points: number[];
  color: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className={cn("text-xl font-display font-bold mt-0.5", color)}>{value}</p>
      <div className={cn("mt-2", color)}>
        <Sparkline points={points} width={300} height={40} ariaLabel={label} />
      </div>
    </div>
  );
}
