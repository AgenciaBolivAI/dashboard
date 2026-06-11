import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Video,
  Download,
  ExternalLink,
  Clock,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTenantBySlug } from "@/lib/tenant";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { listViraClipsForJob, type ViraJob, type ViraClip } from "@/lib/queries/vira";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function fmtSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function fmtClipRange(start: number, end: number): string {
  return `${fmtSeconds(start)}–${fmtSeconds(end)} (${(end - start).toFixed(1)}s)`;
}

const STATUS_META: Record<
  ViraJob["status"],
  { labelKey: string; cls: string; icon: typeof Clock; spinning?: boolean }
> = {
  pending:      { labelKey: "status_pending",      cls: "bg-muted text-muted-foreground", icon: Clock },
  downloading:  { labelKey: "status_downloading",  cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400",     icon: Loader2, spinning: true },
  transcribing: { labelKey: "status_transcribing", cls: "bg-blue-500/15 text-blue-600 dark:text-blue-400",     icon: Loader2, spinning: true },
  analyzing:    { labelKey: "status_analyzing",    cls: "bg-purple-500/15 text-purple-600 dark:text-purple-400", icon: Loader2, spinning: true },
  clipping:     { labelKey: "status_clipping",     cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400",   icon: Loader2, spinning: true },
  done:         { labelKey: "status_done",         cls: "bg-primary/15 text-primary",     icon: Check },
  failed:       { labelKey: "status_failed",       cls: "bg-destructive/15 text-destructive", icon: AlertCircle },
  cancelled:    { labelKey: "status_cancelled",    cls: "bg-muted text-muted-foreground", icon: AlertCircle },
};

export default async function JobClipsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; jobId: string }>;
}) {
  const { tenantSlug, jobId } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  await requireUser();
  await requireTenantAccess(tenant.id);
  const t = await getTranslations("shorts");

  // Service client because the page is admin/dashboard, RLS already validated
  // by requireTenantAccess. Need to load the job + verify it belongs to tenant.
  const svc = createServiceClient();
  const { data: jobData } = await svc
    .from("vira_jobs")
    .select(
      "id, tenant_id, source_url, source_type, status, duration_seconds, language, reasoning_summary, error, transcript, settings_snapshot, created_at, started_at, finished_at",
    )
    .eq("id", jobId)
    .maybeSingle();

  if (!jobData || (jobData as { tenant_id: string }).tenant_id !== tenant.id) {
    notFound();
  }
  type RawJob = ViraJob & { transcript: string | null; settings_snapshot: Record<string, unknown> };
  const job = jobData as unknown as RawJob;

  const clips = await listViraClipsForJob(jobId);
  const totalClipSeconds = clips.reduce((s, c) => s + (Number(c.end_seconds) - Number(c.start_seconds)), 0);
  const meta = STATUS_META[job.status];
  const Icon = meta.icon;
  const statusLabel = t(meta.labelKey);

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href={`/dashboard/${tenantSlug}/shorts`}>
          <ArrowLeft className="size-4" />
          {t("back_to_shorts")}
        </Link>
      </Button>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-display font-extrabold tracking-tight flex items-center gap-2">
            <Video className="size-6 text-rose-500" />
            {t("processed_video")}
            <Badge variant="outline" className={cn("gap-1 text-xs", meta.cls)}>
              <Icon className={cn("size-3", meta.spinning && "animate-spin")} />
              {statusLabel}
            </Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1 truncate">
            <a
              href={job.source_url}
              target="_blank"
              rel="noopener"
              className="hover:underline inline-flex items-center gap-1"
            >
              {job.source_url}
              <ExternalLink className="size-3" />
            </a>
          </p>
        </div>

        <div className="text-sm text-right space-y-0.5">
          {job.duration_seconds && (
            <p className="text-muted-foreground">
              {t("source_duration_label")} <span className="font-mono">{fmtSeconds(job.duration_seconds)}</span>
            </p>
          )}
          {job.language && (
            <p className="text-muted-foreground uppercase text-xs">
              {t("language_label")} <span className="font-mono">{job.language}</span>
            </p>
          )}
          {clips.length > 0 && (
            <p className="text-muted-foreground">
              <span className="font-bold text-foreground">{clips.length}</span> {t("clips_word")} ·{" "}
              <span className="font-mono">{fmtSeconds(totalClipSeconds)}</span> {t("total_word")}
            </p>
          )}
        </div>
      </div>

      {/* Error state */}
      {job.status === "failed" && job.error && (
        <Card className="p-4 mb-6 border-destructive/30 bg-destructive/5">
          <div className="flex gap-3">
            <AlertCircle className="size-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{t("processing_failed")}</p>
              <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{job.error}</p>
            </div>
          </div>
        </Card>
      )}

      {/* In-progress state */}
      {!["done", "failed", "cancelled"].includes(job.status) && (
        <Card className="p-6 mb-6 text-center">
          <Loader2 className="size-10 mx-auto mb-3 text-rose-500 animate-spin" />
          <p className="font-medium">{t("vira_working")}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {t("status_refresh_hint", { status: statusLabel })}
          </p>
        </Card>
      )}

      {/* Reasoning summary */}
      {job.reasoning_summary && (
        <Card className="p-5 mb-6 border-rose-500/20 bg-rose-500/5">
          <p className="text-xs uppercase tracking-wider text-rose-600 dark:text-rose-400 font-semibold mb-2">
            {t("how_vira_chose_clips")}
          </p>
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{job.reasoning_summary}</p>
        </Card>
      )}

      {/* Clips */}
      {clips.length > 0 ? (
        <div className="space-y-4">
          {clips.map((clip) => (
            <ClipCard key={clip.id} clip={clip} viewLabel={t("view")} downloadLabel={t("download")} fileUnavailableLabel={t("file_unavailable")} clipPrefix={t("clip_prefix")} />
          ))}
        </div>
      ) : job.status === "done" ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {t("no_clips_generated")}
        </Card>
      ) : null}

      {/* Transcript */}
      {job.transcript && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
            {t("view_full_transcript")}
          </summary>
          <Card className="p-4 mt-2">
            <p className="text-sm leading-relaxed whitespace-pre-wrap font-mono text-xs text-muted-foreground">
              {job.transcript}
            </p>
          </Card>
        </details>
      )}
    </div>
  );
}

function ClipCard({
  clip,
  viewLabel,
  downloadLabel,
  fileUnavailableLabel,
  clipPrefix,
}: {
  clip: ViraClip;
  viewLabel: string;
  downloadLabel: string;
  fileUnavailableLabel: string;
  clipPrefix: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-secondary">
              {clipPrefix} #{clip.clip_index}
            </span>
            <span className="text-xs text-muted-foreground font-mono">
              {fmtClipRange(Number(clip.start_seconds), Number(clip.end_seconds))}
            </span>
          </div>
          {clip.title && <h3 className="font-display font-semibold text-base mb-1">{clip.title}</h3>}
          {clip.reasoning && (
            <p className="text-sm text-muted-foreground italic mb-3">{clip.reasoning}</p>
          )}
          {clip.transcript_excerpt && (
            <blockquote className="text-sm border-l-2 border-rose-500/40 pl-3 py-1 my-2 bg-muted/30 rounded-r">
              {clip.transcript_excerpt}
            </blockquote>
          )}
        </div>

        <div className="flex flex-col items-stretch gap-2 min-w-[200px]">
          {clip.thumbnail_url ? (
            <div className="rounded-md overflow-hidden bg-black aspect-[9/16] w-full max-w-[120px] mx-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={clip.thumbnail_url}
                alt={`Thumbnail clip ${clip.clip_index}`}
                className="w-full h-full object-cover"
              />
            </div>
          ) : null}
          {clip.output_url ? (
            <>
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <a href={clip.output_url} target="_blank" rel="noopener">
                  <ExternalLink className="size-3.5" />
                  {viewLabel}
                </a>
              </Button>
              <Button asChild size="sm" className="gap-1.5">
                <a href={clip.output_url} download>
                  <Download className="size-3.5" />
                  {downloadLabel}
                </a>
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground text-center">
              {fileUnavailableLabel}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
