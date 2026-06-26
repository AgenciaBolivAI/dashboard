import Link from "next/link";
import {
  MessageSquare,
  MessageCircle,
  Instagram,
  UserPlus,
  CalendarCheck,
  Banknote,
  Phone,
  PhoneOutgoing,
  PhoneIncoming,
  Mail,
  Wallet,
  Target,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTenantBySlug } from "@/lib/tenant";
import {
  getOverviewAnalytics,
  OVERVIEW_PERIODS,
  type OverviewPeriod,
} from "@/lib/queries/overview";
import { getBalance } from "@/lib/billing/credits";
import { getTenantDailyTimeseries } from "@/lib/queries/admin-tenant-pnl";
import { listConversations } from "@/lib/queries/conversations";
import { formatMoney } from "@/lib/format";
import { Sparkline } from "@/components/admin/sparkline";
import { KpiCard } from "@/components/overview/kpi-card";
import { KpiDrill } from "@/components/admin/kpi-drill";
import { PeriodSelector } from "@/components/overview/period-selector";
import { AreaTrend } from "@/components/charts/area-trend";
import { DonutChart } from "@/components/charts/donut-chart";
import { PersonalizedHome } from "@/components/overview/personalized-home";
import { cn } from "@/lib/utils";

// Live data — never cache so KPIs/charts reflect the current period.
export const dynamic = "force-dynamic";

const CHANNEL_META: Record<string, { icon: LucideIcon; key: string }> = {
  whatsapp: { icon: MessageCircle, key: "channel_whatsapp" },
  instagram: { icon: Instagram, key: "channel_instagram" },
  facebook_messenger: { icon: MessageSquare, key: "channel_messenger" },
};

const WORKFORCE_META: Record<string, { icon: LucideIcon }> = {
  whatsapp: { icon: MessageCircle },
  instagram: { icon: Instagram },
  messenger: { icon: MessageSquare },
  sandra: { icon: PhoneOutgoing },
  rebecca: { icon: PhoneIncoming },
  aima: { icon: Target },
  ccavai: { icon: Sparkles },
};

export default async function OverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { tenantSlug } = await params;
  const { period: periodParam } = await searchParams;
  const tenant = await getTenantBySlug(tenantSlug);

  const period: OverviewPeriod = (OVERVIEW_PERIODS as string[]).includes(periodParam ?? "")
    ? (periodParam as OverviewPeriod)
    : "7d";

  const [t, locale, analytics, balance, spend, recent] = await Promise.all([
    getTranslations("overview"),
    getLocale(),
    getOverviewAnalytics(tenant.id, period),
    getBalance(tenant.id),
    getTenantDailyTimeseries(tenant.id, 30),
    listConversations(tenant.id, { limit: 6 }),
  ]);

  const numFmt = (n: number) => n.toLocaleString(locale);
  const currency = tenant.invoice_default_currency;
  const basePath = `/dashboard/${tenantSlug}`;
  const vsPrev = t("vs_prev");

  const periodOptions = OVERVIEW_PERIODS.map((p) => ({ value: p, label: t(`period_${p}` as never) }));

  const channelLabel = (ch: string) => {
    const meta = CHANNEL_META[ch];
    return meta ? t(meta.key as never) : ch;
  };

  const totalConversations = analytics.kpis.conversations.current;
  const donutData = analytics.channelMix.map((s) => ({ name: channelLabel(s.channel), value: s.count }));
  const spendSpark = spend.map((d) => d.usage_credits);

  const showNextSteps = tenant.status === "pending_whatsapp_setup";

  return (
    <div className="analytics-surface p-6 md:p-8 max-w-7xl space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <span className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
            <span className="live-dot size-1.5 rounded-full bg-primary" />
            {t("live_label")}
          </span>
          <h1 className="text-3xl font-display font-extrabold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("subtitle")} · {tenant.industry ?? t("industry_general")}
          </p>
        </div>
        {/* basePath MUST be the overview page itself — the dashboard root redirects
            to /overview and strips ?period, which silently reset every non-default
            period back to 7d. */}
        <PeriodSelector periods={periodOptions} active={period} basePath={`${basePath}/overview`} />
      </div>

      {/* Personalized "Today" strip: My Tasks, Today's Events, AI recommendations */}
      <PersonalizedHome tenantId={tenant.id} tenantSlug={tenantSlug} />

      {/* Primary KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiDrill metric="conversations" tenantId={tenant.id} window={period} dialogTitle={t("kpi_conversations")} loadingLabel={t("dd_loading")}>
          <KpiCard
            icon={MessageSquare}
            label={t("kpi_conversations")}
            value={numFmt(analytics.kpis.conversations.current)}
            deltaPct={analytics.kpis.conversations.deltaPct}
            deltaLabel={vsPrev}
            spark={analytics.kpis.conversations.spark}
          />
        </KpiDrill>
        <KpiDrill metric="leads" tenantId={tenant.id} window={period} dialogTitle={t("kpi_leads")} loadingLabel={t("dd_loading")}>
          <KpiCard
            icon={UserPlus}
            label={t("kpi_leads")}
            value={numFmt(analytics.kpis.leads.current)}
            deltaPct={analytics.kpis.leads.deltaPct}
            deltaLabel={vsPrev}
            spark={analytics.kpis.leads.spark}
          />
        </KpiDrill>
        <KpiDrill metric="reservations" tenantId={tenant.id} window={period} dialogTitle={t("kpi_bookings")} loadingLabel={t("dd_loading")}>
          <KpiCard
            icon={CalendarCheck}
            label={t("kpi_bookings")}
            value={numFmt(analytics.kpis.bookings.current)}
            deltaPct={analytics.kpis.bookings.deltaPct}
            deltaLabel={vsPrev}
            spark={analytics.kpis.bookings.spark}
          />
        </KpiDrill>
        <KpiDrill metric="revenue" tenantId={tenant.id} window={period} dialogTitle={t("kpi_revenue")} loadingLabel={t("dd_loading")}>
          <KpiCard
            icon={Banknote}
            label={t("kpi_revenue")}
            value={formatMoney(analytics.kpis.revenueCents.current, currency, locale)}
            deltaPct={analytics.kpis.revenueCents.deltaPct}
            deltaLabel={vsPrev}
            spark={analytics.kpis.revenueCents.spark}
          />
        </KpiDrill>
      </div>

      {/* Secondary stat strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          icon={Mail}
          label={t("kpi_messages")}
          value={numFmt(analytics.messages.current)}
          deltaPct={analytics.messages.deltaPct}
          deltaLabel={vsPrev}
        />
        <KpiDrill metric="voice" tenantId={tenant.id} window={period} dialogTitle={t("kpi_voice_minutes")} loadingLabel={t("dd_loading")}>
          <KpiCard
            icon={Phone}
            label={t("kpi_voice_minutes")}
            value={numFmt(analytics.voiceMinutes)}
            deltaPct={null}
            deltaLabel={t("kpi_voice_minutes_hint")}
          />
        </KpiDrill>
        <KpiDrill metric="balance" tenantId={tenant.id} window={period} dialogTitle={t("kpi_balance")} loadingLabel={t("dd_loading")}>
          <KpiCard
            icon={Wallet}
            label={t("kpi_balance")}
            value={numFmt(balance?.available_credits ?? 0)}
            deltaPct={null}
            deltaLabel={
              balance?.is_zero
                ? t("kpi_balance_zero")
                : balance?.is_low
                  ? t("kpi_balance_low")
                  : t("kpi_balance_ok")
            }
          />
        </KpiDrill>
      </div>

      {/* Hero chart + channel mix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="panel-pro lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("chart_conversations_title")}</CardTitle>
            <CardDescription>{t("chart_conversations_sub")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AreaTrend data={analytics.conversationSeries} locale={locale} valueLabel={t("kpi_conversations")} />
          </CardContent>
        </Card>

        <Card className="panel-pro">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("channels_title")}</CardTitle>
            <CardDescription>{t("channels_sub")}</CardDescription>
          </CardHeader>
          <CardContent>
            {totalConversations > 0 ? (
              <DonutChart
                data={donutData}
                centerValue={numFmt(totalConversations)}
                centerLabel={t("kpi_conversations")}
                locale={locale}
              />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("empty_period")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Workforce + recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="panel-pro">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("workforce_title")}</CardTitle>
            <CardDescription>{t("workforce_sub")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {analytics.workforce.map((w) => {
              const Icon = WORKFORCE_META[w.key]?.icon ?? Sparkles;
              return (
                <div key={w.key} className="group/wf flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-secondary/50">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-inset ring-primary/20 transition-shadow group-hover/wf:shadow-[0_0_14px_-4px_hsl(var(--primary)/0.6)]">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight">{t(`wf_${w.key}` as never)}</p>
                    <p className="text-xs text-muted-foreground">{t(`wf_${w.key}_sub` as never)}</p>
                  </div>
                  <span className="font-display text-lg font-bold tabular-nums">{numFmt(w.count)}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="panel-pro lg:col-span-2">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">{t("recent_title")}</CardTitle>
              <CardDescription>{t("recent_sub")}</CardDescription>
            </div>
            <Link href={`${basePath}/conversations`} className="text-xs text-primary hover:underline">
              {t("recent_view_all")}
            </Link>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {recent.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("recent_empty")}</p>
            ) : (
              recent.map((c) => (
                <Link
                  key={c.id}
                  href={`${basePath}/conversations`}
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 hover:bg-secondary/30 -mx-2 px-2 rounded transition"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-secondary to-primary/10 text-xs font-semibold ring-1 ring-inset ring-border">
                    {(c.user.name ?? c.user.whatsapp_number ?? "?").slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.user.name ?? c.user.whatsapp_number}</p>
                    <p className="truncate text-xs text-muted-foreground">{c.user.whatsapp_number}</p>
                  </div>
                  <ConversationStatus status={c.hitl_taken_over ? "hitl" : c.status} t={t} />
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {timeAgo(c.last_message_at, locale)}
                  </span>
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Spend mini + next steps */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className={cn("panel-pro", showNextSteps ? "lg:col-span-1" : "lg:col-span-3")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("spend_title")}</CardTitle>
            <CardDescription>{t("spend_sub")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="font-display text-2xl font-bold">
                  {numFmt(spend.reduce((s, d) => s + d.usage_credits, 0))}
                </p>
                <p className="text-xs text-muted-foreground">{t("spend_credits_30d")}</p>
              </div>
              <div className="text-primary">
                <Sparkline points={spendSpark} width={160} height={40} showZeroLine={false} />
              </div>
            </div>
            <Link
              href={`${basePath}/billing`}
              className="mt-3 inline-block text-xs text-primary hover:underline"
            >
              {t("spend_view_billing")}
            </Link>
          </CardContent>
        </Card>

        {showNextSteps ? (
          <Card className="panel-pro lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("next_steps_title")}</CardTitle>
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
        ) : null}
      </div>
    </div>
  );
}

function ConversationStatus({
  status,
  t,
}: {
  status: string;
  t: (k: string) => string;
}) {
  const variant =
    status === "active" ? "success" : status === "hitl" ? "warning" : "muted";
  const label =
    status === "active"
      ? t("status_active")
      : status === "hitl"
        ? t("status_hitl")
        : t("status_closed");
  return (
    <Badge variant={variant as "success" | "warning" | "muted"} className="shrink-0">
      {label}
    </Badge>
  );
}

/** Compact relative time ("2m", "3h", "1d") localized via Intl.RelativeTimeFormat. */
function timeAgo(iso: string, locale: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "narrow" });
  const min = Math.round(diffMs / 60000);
  if (Math.abs(min) < 60) return rtf.format(-min, "minute");
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) return rtf.format(-hr, "hour");
  const day = Math.round(hr / 24);
  return rtf.format(-day, "day");
}
