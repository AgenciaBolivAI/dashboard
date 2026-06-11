import { Video, Info } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
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
  const t = await getTranslations("shorts");

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
          {t("initializing_settings")}
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
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              {t("page_subtitle")}
            </p>
          </div>
        </div>
      </div>

      {/* Submit form — first thing on the page */}
      <div className="mb-6">
        <SubmitJobForm tenantId={tenant.id} />
      </div>

      {/* Jobs list */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-display font-semibold">{t("your_videos")}</h2>
          {jobs.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {jobs.length === 1
                ? t("jobs_count_one", { count: jobs.length })
                : t("jobs_count_other", { count: jobs.length })}
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
            <p className="font-medium">{t("how_vira_reasons_title")}</p>
            <p className="text-muted-foreground">
              {t("how_vira_reasons_prefix", { count: settings.clips_per_video })}
              <code className="text-xs px-1 py-0.5 rounded bg-secondary">{settings.clip_style}</code>
              {t("how_vira_reasons_suffix")}
            </p>
            <p className="font-medium pt-2">{t("billing_title")}</p>
            <p className="text-muted-foreground">
              {t("billing_explainer_prefix")}<strong>{t("billing_example_total")}</strong>.
            </p>
          </div>
        </div>
      </Card>

      {/* Settings */}
      <div>
        <h2 className="text-lg font-display font-semibold mb-3">{t("settings_heading")}</h2>
        <ViraSettingsForm tenantId={tenant.id} settings={settings} />
      </div>
    </div>
  );
}
