"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { renderBrandedDataUri } from "@/lib/content/brand-render";
import { uploadCcavaiImage, decodeDataUri } from "@/lib/content/ccavai-storage";
import { publishDraft, type PublishTarget } from "@/lib/content/publish";

export type CcavaiState = { error: string | null; success?: boolean };

/**
 * Publish a draft natively to the tenant's connected Facebook Page or
 * Instagram account (operator+). Marks the draft posted on success.
 */
export async function publishCcavaiDraftAction(
  tenantId: string,
  draftId: string,
  target: PublishTarget,
): Promise<CcavaiState & { url?: string; code?: string }> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });
  const r = await publishDraft({ tenantId, draftId, target });
  if (!r.ok) return { error: r.error ?? "publish_failed", code: r.error };
  revalidatePath("/dashboard", "layout");
  return { error: null, success: true, url: r.url };
}

const STATUS_VALUES = ["pending", "approved", "rejected", "posted", "archived"] as const;
const statusSchema = z.enum(STATUS_VALUES);

export async function updateCcavaiDraftStatusAction(
  tenantId: string,
  draftId: string,
  status: string,
  notes?: string,
  postedUrl?: string,
): Promise<CcavaiState> {
  const parsed = statusSchema.safeParse(status);
  if (!parsed.success) return { error: "Estado inválido" };

  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  // Service client (bypasses RLS) like the sibling draft-mutation actions —
  // ccavai_drafts has no member UPDATE policy. Access is already gated by
  // requireTenantAccess above; the .eq("tenant_id") below scopes the write
  // to this tenant's drafts so an operator can't touch another tenant's row.
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("ccavai_drafts")
    .update({
      status: parsed.data,
      decided_at: new Date().toISOString(),
      ...(notes !== undefined && { decided_notes: notes.trim() || null }),
      ...(postedUrl !== undefined && { posted_url: postedUrl.trim() || null }),
    })
    .eq("id", draftId)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

/**
 * Update a draft's editable text fields. If any of branded_headline /
 * accent_phrases changed AND a subject is on file, also re-render the
 * branded image so the overlay reflects the new text. The expensive
 * gpt-image-1 call is NOT re-run — only the brand template.
 */
const editTextSchema = z.object({
  draft_title: z.string().trim().max(500).nullable().optional(),
  draft_body: z.string().trim().min(1).max(5000).optional(),
  draft_hashtags: z.array(z.string().trim().max(60)).max(20).optional(),
  branded_headline: z.string().trim().max(160).nullable().optional(),
  accent_phrases: z.array(z.string().trim().max(60)).max(5).optional(),
});

export async function updateCcavaiDraftAction(
  tenantId: string,
  draftId: string,
  fields: z.infer<typeof editTextSchema>,
): Promise<CcavaiState> {
  const parsed = editTextSchema.safeParse(fields);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const svc = createServiceClient();

  // Read current draft state so we can decide whether to re-render.
  const { data: existingRow, error: readErr } = await svc
    .from("ccavai_drafts")
    .select("subject_image_url, branded_headline, accent_phrases, category_label")
    .eq("id", draftId)
    .single();
  if (readErr || !existingRow) {
    return { error: readErr?.message ?? "Draft no encontrado" };
  }
  const existing = existingRow as {
    subject_image_url: string | null;
    branded_headline: string | null;
    accent_phrases: unknown;
    category_label: string | null;
  };

  const newBrandedHeadline =
    parsed.data.branded_headline !== undefined
      ? parsed.data.branded_headline
      : existing.branded_headline;
  const newAccentPhrases =
    parsed.data.accent_phrases !== undefined
      ? parsed.data.accent_phrases
      : Array.isArray(existing.accent_phrases)
        ? (existing.accent_phrases as string[])
        : [];

  const overlayChanged =
    (parsed.data.branded_headline !== undefined &&
      parsed.data.branded_headline !== existing.branded_headline) ||
    parsed.data.accent_phrases !== undefined;

  // Re-render the brand template if the overlay changed and we have a subject.
  let rebrandedImageUrl: string | undefined;
  if (overlayChanged && existing.subject_image_url && newBrandedHeadline) {
    try {
      rebrandedImageUrl = await renderBrandedDataUri({
        subject_image: existing.subject_image_url,
        headline: newBrandedHeadline,
        accent_phrases: newAccentPhrases,
        // Reuse the draft's own badge (already in the tenant's content language).
        // Never hardcode a language-specific label here — that produced a Spanish
        // "SERVICIO" badge on English content (and vice-versa) on re-render.
        category_label: existing.category_label ?? undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "render failed";
      return { error: `No se pudo regenerar imagen: ${msg}` };
    }
  }

  const { error: updErr } = await svc
    .from("ccavai_drafts")
    .update({
      ...(parsed.data.draft_title !== undefined && { draft_title: parsed.data.draft_title }),
      ...(parsed.data.draft_body !== undefined && { draft_body: parsed.data.draft_body }),
      ...(parsed.data.draft_hashtags !== undefined && { draft_hashtags: parsed.data.draft_hashtags }),
      ...(parsed.data.branded_headline !== undefined && { branded_headline: parsed.data.branded_headline }),
      ...(parsed.data.accent_phrases !== undefined && { accent_phrases: parsed.data.accent_phrases }),
      ...(rebrandedImageUrl !== undefined && { image_url: rebrandedImageUrl }),
    })
    .eq("id", draftId);
  if (updErr) return { error: updErr.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

/**
 * Replace a draft's subject image. Two modes:
 *  - upload  → caller passes a data URI (any image format).
 *  - ai_regen → caller passes a new image_prompt; we hit gpt-image-1.
 * After we have the new subject, we run it through the brand template
 * (with the draft's existing branded_headline + accent_phrases) and
 * persist BOTH subject_image_url AND image_url.
 */
const replaceSubjectSchema = z
  .object({
    mode: z.enum(["upload", "ai_regen"]),
    subject_data_uri: z
      .string()
      .regex(/^data:image\/(png|jpeg|jpg|webp);base64,/, "Debe ser data URI de imagen")
      .max(15_000_000)
      .optional(),
    image_prompt: z.string().trim().min(5).max(2000).optional(),
  })
  .refine(
    (v) =>
      (v.mode === "upload" && !!v.subject_data_uri) ||
      (v.mode === "ai_regen" && !!v.image_prompt),
    { message: "Falta el dato según el modo" },
  );

export async function replaceCcavaiSubjectAction(
  tenantId: string,
  draftId: string,
  input: z.infer<typeof replaceSubjectSchema>,
): Promise<CcavaiState> {
  const parsed = replaceSubjectSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const svc = createServiceClient();
  const { data: existingRow, error: readErr } = await svc
    .from("ccavai_drafts")
    .select("branded_headline, accent_phrases, story_title, category_label")
    .eq("id", draftId)
    .eq("tenant_id", tenantId)
    .single();
  if (readErr || !existingRow) {
    return { error: readErr?.message ?? "Draft no encontrado" };
  }
  const existing = existingRow as {
    branded_headline: string | null;
    accent_phrases: unknown;
    story_title: string | null;
    category_label: string | null;
  };

  // Step 1: get a subject data URI either from upload or from gpt-image-1.
  let subjectDataUri: string;
  if (parsed.data.mode === "upload") {
    subjectDataUri = parsed.data.subject_data_uri!;
  } else {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return { error: "OPENAI_API_KEY no configurado" };
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt:
          parsed.data.image_prompt +
          " Professional photographic style. Modern, clean composition. Natural lighting. No text overlays.",
        size: "1024x1024",
        quality: "medium",
        n: 1,
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!res.ok) {
      return { error: `gpt-image-1 ${res.status}: ${(await res.text()).slice(0, 200)}` };
    }
    const json = (await res.json()) as { data?: { b64_json?: string }[] };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) return { error: "OpenAI no devolvió imagen" };
    subjectDataUri = `data:image/png;base64,${b64}`;
  }

  // Step 2: brand it.
  const headline = existing.branded_headline ?? existing.story_title ?? "";
  const accents = Array.isArray(existing.accent_phrases)
    ? (existing.accent_phrases as string[])
    : [];
  let brandedDataUri: string;
  try {
    brandedDataUri = await renderBrandedDataUri({
      subject_image: subjectDataUri,
      headline,
      accent_phrases: accents,
      // Preserve the draft's own content-language badge instead of forcing a
      // hardcoded English label (root cause of the badge/content language mismatch).
      category_label: existing.category_label ?? undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "render failed";
    return { error: `No se pudo brandear la imagen: ${msg}` };
  }

  // Upload both images to Storage; persist URLs (not multi-MB base64) so the
  // DB stays slim and thumbnail renders don't ship 3MB of Postgres egress.
  let subjectUrl = subjectDataUri;
  let brandedUrl = brandedDataUri;
  try {
    const subjDec = decodeDataUri(subjectDataUri);
    if (subjDec) subjectUrl = await uploadCcavaiImage(tenantId, "subject", subjDec.buf, subjDec.contentType);
    const brandDec = decodeDataUri(brandedDataUri);
    if (brandDec) brandedUrl = await uploadCcavaiImage(tenantId, "branded", brandDec.buf, brandDec.contentType);
  } catch (e) {
    return { error: `No se pudo subir la imagen: ${e instanceof Error ? e.message : "error"}` };
  }

  const { error: updErr } = await svc
    .from("ccavai_drafts")
    .update({
      subject_image_url: subjectUrl,
      image_url: brandedUrl,
    })
    .eq("id", draftId)
    .eq("tenant_id", tenantId);
  if (updErr) return { error: updErr.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

export type CcavaiMode = "mixed" | "news" | "brand";

export async function triggerCcavaiGenerationAction(
  tenantId: string,
  mode: CcavaiMode = "mixed",
): Promise<CcavaiState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const safeMode: CcavaiMode = ["mixed", "news", "brand"].includes(mode)
    ? mode
    : "mixed";

  const url = process.env.CCAVAI_WEBHOOK_URL;
  const secret = process.env.CCAVAI_WEBHOOK_SECRET;
  if (!url || !secret) {
    return {
      error: "CCAVAI webhook no configurado (CCAVAI_WEBHOOK_URL / CCAVAI_WEBHOOK_SECRET).",
    };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      // tenant_id routes the multi-tenant workflow; mode picks the content
      // source: news (RSS only), brand (persona only), or mixed (both).
      body: JSON.stringify({ tenant_id: tenantId, mode: safeMode }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return { error: `Webhook respondió ${res.status}` };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("timeout") || msg.includes("aborted")) {
      // Workflow runs ~60s — a timeout here means the request reached n8n,
      // execution is already underway, and we just lost the ack. Treat as ok.
      return { error: null, success: true };
    }
    return { error: msg };
  }

  return { error: null, success: true };
}

// Alias for the new settings form which uses the more concise name
export const triggerCcavaiRunAction = triggerCcavaiGenerationAction;

// ── Per-tenant settings ──────────────────────────────────────────────
const PLATFORMS_VALUES = ["linkedin", "instagram", "facebook", "x"] as const;
const TONE_VALUES = [
  "professional_warm",
  "casual_friendly",
  "bold_punchy",
  "educational",
  "industry_voice",
] as const;
const IMAGE_STYLE_VALUES = [
  "branded_modern",
  "editorial",
  "photographic",
  "illustration",
] as const;

const settingsSchema = z.object({
  enabled: z.boolean().optional(),
  platforms: z.array(z.enum(PLATFORMS_VALUES)).max(10).optional(),
  tone: z.enum(TONE_VALUES).optional(),
  rss_sources: z
    .array(
      z.object({
        url: z.string().trim().url("URL inválida").max(500),
        name: z.string().trim().max(100).optional(),
      }),
    )
    .max(30)
    .optional(),
  drafts_per_run: z.coerce.number().int().min(1).max(10).optional(),
  generate_images: z.boolean().optional(),
  image_style: z.enum(IMAGE_STYLE_VALUES).optional(),
  auto_post: z.boolean().optional(),
  brand_vocabulary: z.string().trim().max(2000).nullable().optional(),
  do_not_say: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
});

export async function updateCcavaiSettingsAction(
  tenantId: string,
  fields: z.infer<typeof settingsSchema>,
): Promise<CcavaiState> {
  const parsed = settingsSchema.safeParse(fields);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const svc = createServiceClient();
  const { error } = await svc.from("ccavai_settings").upsert(
    {
      tenant_id: tenantId,
      ...parsed.data,
      ...(parsed.data.rss_sources !== undefined && {
        rss_sources: parsed.data.rss_sources as unknown as Record<string, never>[],
      }),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );
  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}
