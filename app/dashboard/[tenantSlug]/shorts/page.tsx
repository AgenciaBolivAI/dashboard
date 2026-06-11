import { Video, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getTenantBySlug } from "@/lib/tenant";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { getViraSettings, listViraJobs } from "@/lib/queries/vira";
import { ViraSettingsForm } from "@/components/vira/vira-settings-form";
import { SubmitJobForm } from "@/components/vira/submit-job-form";
import { JobsTable } from "@/components/vira/jobs-table";

export const dynamic = "force-dynamic";

export default async function ViraShortsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  await requireUser();
  await requireTenantAccess(tenant.id);

  const [settings, jobs] = await Promise.all([
    getViraSettings(tenant.id),
    listViraJobs(tenant.id, 20),
  ]);

  // Auto-seed settings if missing (in case the trigger didn't fire for some reason)
  if (!settings) {
    return (
      <div className="p-6 md:p-8 max-w-3xl">
        <h1 className="text-3xl font-display font-extrabold tracking-tight">VIRA · Video Shorts</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Inicializando ajustes de VIRA. Recarga la página en unos segundos.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <div className="mb-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-display font-extrabold tracking-tight flex items-center gap-2">
              <Video className="size-7 text-rose-500" />
              VIRA · Video Shorts
              {settings.enabled ? (
                <Badge variant="success" className="text-xs">activa</Badge>
              ) : (
                <Badge variant="muted" className="text-xs">apagada</Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Tu agente IA que ve videos largos y extrae shorts virales. Le pegas un link,
              VIRA razona sobre la transcripción y el momento, y te devuelve clips listos
              para publicar.
            </p>
          </div>
        </div>
      </div>

      {/* Submit form — first thing on the page */}
      <div className="mb-6">
        <SubmitJobForm tenantId={tenant.id} enabled={settings.enabled} />
      </div>

      {/* Jobs list */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-display font-semibold">Tus videos</h2>
          {jobs.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {jobs.length} {jobs.length === 1 ? "trabajo" : "trabajos"}
            </p>
          )}
        </div>
        <JobsTable jobs={jobs} tenantSlug={tenantSlug} />
      </div>

      {/* Info card — what VIRA does + how billing works */}
      <Card className="p-4 mb-6 border-rose-500/20 bg-rose-500/5">
        <div className="flex gap-3">
          <Info className="size-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="text-sm space-y-2">
            <p className="font-medium">Cómo razona VIRA</p>
            <p className="text-muted-foreground">
              No corta al azar. Después de transcribir, identifica:
              hooks de los primeros segundos, oraciones completas que se pueden compartir solas,
              respuestas a preguntas, momentos de cambio emocional, y momentos donde el audio
              tiene picos de energía. Luego elige los {settings.clips_per_video} mejores según
              el estilo configurado (
              <code className="text-xs px-1 py-0.5 rounded bg-secondary">{settings.clip_style}</code>
              ) y los corta respetando las oraciones para que el clip tenga sentido por sí solo.
            </p>
            <p className="font-medium pt-2">Cobro</p>
            <p className="text-muted-foreground">
              10 créditos por minuto de video procesado (incluye transcripción y análisis) +
              2 créditos por segundo de clip generado. Un video de 10 min con 3 clips de
              30 segundos = 100 + 180 = <strong>280 créditos ($2.80)</strong>.
            </p>
          </div>
        </div>
      </Card>

      {/* Settings */}
      <div>
        <h2 className="text-lg font-display font-semibold mb-3">Ajustes</h2>
        <ViraSettingsForm tenantId={tenant.id} settings={settings} />
      </div>
    </div>
  );
}
