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

export const dynamic = "force-dynamic";

export default async function AimaMarketingPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);

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
            Marketing IA
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            AIMA busca dueños de negocios en la web, les manda cold email vía
            Instantly, y pasa las respuestas calientes a la cola de Sandra para
            que las llame.
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
            Scraper {settings?.scraper_enabled ? "ON" : "OFF"}
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
            Cold email {settings?.cold_email_enabled ? "ON" : "OFF"}
          </Badge>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard
          icon={Users}
          label="Leads 7d"
          value={stats7d?.leads_sourced ?? 0}
          color="text-violet-600"
        />
        <StatCard
          icon={Mail}
          label="Emails enviados"
          value={stats7d?.emails_sent ?? 0}
          color="text-emerald-600"
        />
        <StatCard
          icon={MessageSquare}
          label="Respuestas"
          value={stats7d?.emails_replied ?? 0}
          color="text-amber-600"
        />
        <StatCard
          icon={Search}
          label="En cola Sandra"
          value={stats7d?.in_sandra_queue ?? 0}
          color="text-cyan-600"
        />
        <StatCard
          icon={Activity}
          label="Demos cerradas"
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
            Configuración no encontrada — la migración no se aplicó. Avisar al
            equipo de ops.
          </p>
        </Card>
      )}

      {/* Recent runs */}
      <div className="mt-12">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3">
          Últimos runs del scraper
        </h3>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay runs. Cuando AIMA arranque, aparecerán aquí con el conteo
            de leads nuevos.
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
                title={r.error ?? `${r.leads_new} nuevos / ${r.leads_found} encontrados`}
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
                {r.leads_new}n
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
