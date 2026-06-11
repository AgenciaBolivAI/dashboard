"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser, requireTenantAccess } from "@/lib/auth";

export type ViraState = { error: string | null; success?: boolean; job_id?: string };

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  min_clip_seconds: z.coerce.number().int().min(5).max(120).optional(),
  max_clip_seconds: z.coerce.number().int().min(10).max(180).optional(),
  clips_per_video: z.coerce.number().int().min(1).max(10).optional(),
  output_format: z.enum(["9:16", "1:1", "16:9"]).optional(),
  clip_style: z.enum(["high_energy", "educational", "storytelling", "qa_highlights"]).optional(),
  add_subtitles: z.boolean().optional(),
  subtitle_style: z.enum(["bold_centered", "minimal_bottom", "word_pop"]).optional(),
  add_watermark: z.boolean().optional(),
  watermark_text: z.string().trim().max(120).nullable().optional(),
  max_input_minutes: z.coerce.number().int().min(1).max(240).optional(),
  auto_post_drafts: z.boolean().optional(),
});

export async function updateViraSettingsAction(
  tenantId: string,
  fields: z.infer<typeof settingsSchema>,
): Promise<ViraState> {
  const parsed = settingsSchema.safeParse(fields);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  // Cross-field sanity: min <= max
  if (
    parsed.data.min_clip_seconds != null &&
    parsed.data.max_clip_seconds != null &&
    parsed.data.min_clip_seconds > parsed.data.max_clip_seconds
  ) {
    return { error: "El mínimo no puede ser mayor que el máximo" };
  }

  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const svc = createServiceClient();
  const { error } = await svc
    .from("vira_settings")
    .upsert(
      { tenant_id: tenantId, ...parsed.data, updated_at: new Date().toISOString() },
      { onConflict: "tenant_id" },
    );
  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

// URL detection — covers the common shorthand the user pastes
function detectSourceType(url: string): "youtube" | "vimeo" | "mp4_url" | "unknown" {
  const u = url.toLowerCase();
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("vimeo.com")) return "vimeo";
  if (u.endsWith(".mp4") || u.endsWith(".mov") || u.endsWith(".webm")) return "mp4_url";
  return "unknown";
}

const submitSchema = z.object({
  source_url: z
    .string()
    .trim()
    .url("URL de video inválida")
    .max(500),
});

/**
 * Queue a new VIRA job. The actual download + transcribe + analyze + clip
 * pipeline runs in an n8n workflow (not wired to a real ffmpeg worker yet —
 * the queue exists, the worker is the follow-up).
 */
export async function submitViraJobAction(
  tenantId: string,
  source_url: string,
): Promise<ViraState> {
  const parsed = submitSchema.safeParse({ source_url });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "URL inválida" };
  }

  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const svc = createServiceClient();
  // Get current settings snapshot so changes mid-flight don't reshape this job
  const { data: settings } = await svc
    .from("vira_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!settings) {
    return { error: "VIRA no está configurado para este tenant" };
  }
  if (!(settings as { enabled: boolean }).enabled) {
    return { error: "VIRA está deshabilitado en este tenant. Actívalo en Ajustes → Shorts." };
  }

  const sourceType = detectSourceType(parsed.data.source_url);

  const { data: job, error } = await svc
    .from("vira_jobs")
    .insert({
      tenant_id: tenantId,
      source_url: parsed.data.source_url,
      source_type: sourceType,
      status: "pending",
      settings_snapshot: settings as unknown as Record<string, never>,
    })
    .select("id")
    .single();

  if (error || !job) return { error: error?.message ?? "No se pudo encolar el trabajo" };

  // Fire-and-forget: poke the n8n VIRA worker if configured. The worker
  // picks pending jobs anyway via its own poll, so this is just to nudge.
  const webhookUrl = process.env.VIRA_WEBHOOK_URL;
  const webhookSecret = process.env.VIRA_WEBHOOK_SECRET ?? process.env.CCAVAI_WEBHOOK_SECRET;
  if (webhookUrl && webhookSecret) {
    try {
      fetch(webhookUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${webhookSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tenant_id: tenantId, job_id: (job as { id: string }).id }),
        signal: AbortSignal.timeout(8000),
      }).catch(() => {});
    } catch {
      // ignore — worker polls anyway
    }
  }

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true, job_id: (job as { id: string }).id };
}
