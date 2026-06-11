import { Megaphone, Activity, Users, Mail, MessageSquare, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTenantBySlug } from "@/lib/tenant";
import {
  getAimaSettings,
  listAimaScrapeRuns,
  getAimaStats,
} from "@/lib/queries/aima";
import { AimaSettingsForm } from "@/components/aima/aima-settings-form";
import { cn } from "@/lib/utils";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function AimaMarketingPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  const t = await getTranslations("marketing");

  const [settings, runs, stats7d] = await Promise.all([
    getAimaSettings(tenant.id),
    listAimaScrapeRuns(tenant.id, 10),
    getAimaStats("7d"),
  ]);

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-display font-extrabold tracking-tight flex items-center gap-2">
            <Megaphone className="size-7 text-violet-500" />
            {t("page_title")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            {t("page_description")}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge
            variant="outline"
            className={cn(
              "gap-1.5",
              settings?.scraper_enabled
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            <Activity className="size-3" />
            {t("scraper_label")} {settings?.scraper_enabled ? t("on") : t("off")}
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              "gap-1.5",
              settings?.cold_email_enabled
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600"
                : "border-border text-muted-foreground",
            )}
          >
            <Mail className="size-3" />
            {t("cold_email_label")} {settings?.cold_email_enabled ? t("on") : t("off")}
          </Badge>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard
          icon={Users}
          label={t("stat_leads_7d")}
          value={stats7d?.leads_sourced ?? 0}
          color="text-violet-600"
        />
        <StatCard
          icon={Mail}
          label={t("stat_emails_sent")}
          value={stats7d?.emails_sent ?? 0}
          color="text-emerald-600"
        />
        <StatCard
          icon={MessageSquare}
          label={t("stat_replies")}
          value={stats7d?.emails_replied ?? 0}
          color="text-amber-600"
        />
        <StatCard
          icon={Search}
          label={t("stat_sandra_queue")}
          value={stats7d?.in_sandra_queue ?? 0}
          color="text-cyan-600"
        />
        <StatCard
          icon={Activity}
          label={t("stat_demos_booked")}
          value={stats7d?.demos_booked ?? 0}
          color="text-green-600"
        />
      </div>

      {/* Settings form */}
      {settings ? (
        <AimaSettingsForm tenantId={tenant.id} settings={settings} />
      ) : (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">
            {t("settings_missing")}
          </p>
        </Card>
      )}

      {/* Recent runs */}
      <div className="mt-12">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
          {t("recent_runs_title")}
        </h3>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("no_runs_yet")}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {runs.map((r) => (
              <Badge
                key={r.id}
                variant="outline"
                className={cn(
                  "gap-2 text-xs",
                  r.status === "success" && "border-green-500/30 text-green-600",
                  r.status === "failed" && "border-destructive/30 text-destructive",
                  r.status === "running" && "border-amber-500/30 text-amber-600",
                  r.status === "aborted" && "border-muted-foreground/30 text-muted-foreground",
                )}
                title={r.error ?? t("run_tooltip", { newLeads: r.leads_new, foundLeads: r.leads_found })}
              >
                {new Date(r.started_at).toLocaleString("es-BO", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {" · "}
                {r.source}
                {" · "}
                {t("leads_new_short", { count: r.leads_new })}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Megaphone;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Icon className={cn("size-3.5", color)} />
        <span>{label}</span>
      </div>
      <p className={cn("text-2xl font-display font-bold", color)}>{value}</p>
    </Card>
  );
}
