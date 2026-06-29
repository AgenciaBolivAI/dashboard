"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveAudience, audienceIncludesLeads, type AudienceFilter } from "@/lib/marketing/audience";
import { draftCampaignCopy } from "@/lib/marketing/ai-copy";
import { isColdOutreachAttested, COLD_OUTREACH_BLOCKED_MSG } from "@/lib/aima/consent";
import type { MarketingChannel } from "@/lib/marketing/channels";

export type MarketingActionResult = { ok: boolean; error?: string; id?: string; count?: number };

const CHANNELS = ["email", "whatsapp", "sms"] as const;

const audienceSchema = z.object({
  source: z.enum(["leads", "customers", "both"]).optional(),
  lead_status: z.string().trim().max(40).nullable().optional(),
  lead_source: z.string().trim().max(60).nullable().optional(),
  vip_only: z.boolean().optional(),
  limit: z.number().int().min(1).max(5000).optional(),
});

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  goal: z.string().trim().max(2000).nullable().optional(),
  channel: z.enum(CHANNELS),
  subject: z.string().trim().max(200).nullable().optional(),
  body: z.string().trim().min(1).max(5000),
  audience: audienceSchema,
  budget_credits: z.number().int().min(0).max(10_000_000).nullable().optional(),
  scheduled_at: z.string().datetime().nullable().optional(),
});

function svcClient(): SupabaseClient {
  return createServiceClient() as unknown as SupabaseClient;
}

/**
 * Create a broadcast campaign in 'draft'. Nothing sends until it's approved
 * (approveBroadcastAction resolves the audience + enqueues). operator+ only.
 */
export async function createBroadcastAction(
  tenantId: string,
  input: z.infer<typeof createSchema>,
): Promise<MarketingActionResult> {
  const et = await getTranslations("action_errors");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? et("invalid_data") };
  }
  const user = await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const d = parsed.data;
  // Email needs a subject; fall back to the campaign title. Messaging channels
  // never carry one.
  const subject = d.channel === "email" ? (d.subject?.trim() || d.title) : null;

  const svc = svcClient();
  const { data: camp, error } = await svc
    .from("marketing_campaigns")
    .insert({
      tenant_id: tenantId,
      title: d.title,
      goal: d.goal ?? null,
      channel: d.channel,
      kind: "broadcast",
      subject,
      body: d.body,
      audience: d.audience ?? {},
      status: "draft",
      budget_credits: d.budget_credits ?? null,
      scheduled_at: d.scheduled_at ?? null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard", "layout");
  return { ok: true, id: (camp as { id: string }).id };
}

/**
 * Approve a draft → resolve its audience → bulk-enqueue per-recipient messages →
 * flip to 'approved' (the tick then sends them). operator+ only. Gated by the
 * cold-outreach consent attestation when the audience targets leads.
 */
export async function approveBroadcastAction(
  tenantId: string,
  campaignId: string,
): Promise<MarketingActionResult> {
  const et = await getTranslations("action_errors");
  const user = await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const svc = svcClient();
  const { data: campRow } = await svc
    .from("marketing_campaigns")
    .select("id, channel, subject, body, audience, scheduled_at, status")
    .eq("id", campaignId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const c = campRow as
    | {
        id: string;
        channel: MarketingChannel;
        subject: string | null;
        body: string | null;
        audience: AudienceFilter;
        scheduled_at: string | null;
        status: string;
      }
    | null;
  if (!c) return { ok: false, error: et("reservation_not_found") };
  if (c.status !== "draft") return { ok: false, error: et("draft_invalid_status") };
  if (!c.body) return { ok: false, error: et("invalid_data") };

  const audience = (c.audience ?? {}) as AudienceFilter;
  // Cold-outreach lawful-basis gate: only when messaging leads (prospects).
  if (audienceIncludesLeads(audience) && !(await isColdOutreachAttested(tenantId))) {
    return { ok: false, error: COLD_OUTREACH_BLOCKED_MSG };
  }

  const recipients = await resolveAudience(tenantId, c.channel, audience);
  if (recipients.length === 0) {
    return { ok: false, error: et("marketing_no_recipients") };
  }

  const scheduledAt = c.scheduled_at ?? new Date().toISOString();
  const rows = recipients.map((r) => ({
    tenant_id: tenantId,
    campaign_id: campaignId,
    step_id: null,
    recipient_kind: r.kind,
    recipient_id: r.id,
    channel: c.channel,
    to_address: r.to,
    subject: c.subject,
    body: c.body,
    status: "queued",
    scheduled_at: scheduledAt,
  }));

  // Idempotent retry: clear any messages left by a failed prior approve. Safe —
  // this only runs while status='draft', i.e. nothing has been sent yet.
  await svc.from("marketing_messages").delete().eq("campaign_id", campaignId).eq("tenant_id", tenantId);

  // Chunked insert (the unique enrollment index still guards against duplicates).
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await svc.from("marketing_messages").insert(rows.slice(i, i + 500));
    if (error) return { ok: false, error: error.message };
  }

  const { error: upErr } = await svc
    .from("marketing_campaigns")
    .update({
      status: "approved",
      total_recipients: recipients.length,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", campaignId)
    .eq("tenant_id", tenantId)
    .eq("status", "draft");
  if (upErr) return { ok: false, error: upErr.message };

  revalidatePath("/dashboard", "layout");
  return { ok: true, id: campaignId, count: recipients.length };
}

/** Live recipient-count preview for the builder. operator+ only. */
export async function previewAudienceAction(
  tenantId: string,
  channel: MarketingChannel,
  audience: AudienceFilter,
): Promise<{ ok: boolean; count?: number; error?: string }> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });
  const parsed = audienceSchema.safeParse(audience);
  if (!CHANNELS.includes(channel) || !parsed.success) {
    return { ok: false, error: "invalid" };
  }
  const recipients = await resolveAudience(tenantId, channel, parsed.data);
  return { ok: true, count: recipients.length };
}

/** BOLIV drafts subject + body for the builder. operator+ only. */
export async function draftBroadcastCopyAction(
  tenantId: string,
  input: { goal: string; channel: MarketingChannel; tone?: string | null },
): Promise<{ ok: boolean; subject?: string | null; body?: string; error?: string }> {
  const user = await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });
  const goal = (input.goal ?? "").trim();
  if (!goal) return { ok: false, error: "empty" };
  if (!CHANNELS.includes(input.channel)) return { ok: false, error: "invalid" };

  const svc = svcClient();
  const { data: t } = await svc.from("tenants").select("name, language").eq("id", tenantId).maybeSingle();
  const tenant = t as { name: string | null; language: string | null } | null;

  const res = await draftCampaignCopy(
    tenantId,
    { goal, channel: input.channel, businessName: tenant?.name, language: tenant?.language, tone: input.tone ?? null },
    user.id,
  );
  return res.ok ? { ok: true, subject: res.subject, body: res.body } : { ok: false, error: res.error };
}

/** Pause / resume / cancel (kill switch). operator+ only. */
async function setBroadcastStatus(
  tenantId: string,
  campaignId: string,
  status: "paused" | "approved" | "cancelled",
): Promise<MarketingActionResult> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });
  const svc = svcClient();
  const { error } = await svc
    .from("marketing_campaigns")
    .update({ status })
    .eq("id", campaignId)
    .eq("tenant_id", tenantId)
    .not("status", "in", "(done,cancelled)");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true, id: campaignId };
}

export async function pauseBroadcastAction(tenantId: string, id: string) {
  return setBroadcastStatus(tenantId, id, "paused");
}
export async function resumeBroadcastAction(tenantId: string, id: string) {
  return setBroadcastStatus(tenantId, id, "approved");
}
export async function cancelBroadcastAction(tenantId: string, id: string) {
  return setBroadcastStatus(tenantId, id, "cancelled");
}
