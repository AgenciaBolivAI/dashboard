"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";

export type CampaignActionResult = { ok: boolean; error?: string; id?: string };

const STEP_KINDS = ["aima_scrape", "sandra_calls", "report", "wait"] as const;

const stepSchema = z.object({
  kind: z.enum(STEP_KINDS),
  params: z.record(z.string(), z.unknown()).optional(),
  scheduled_at: z.string().datetime().nullable().optional(),
});

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  goal: z.string().trim().max(2000).optional().nullable(),
  budget_credits: z.number().int().min(0).max(10_000_000).optional().nullable(),
  steps: z.array(stepSchema).min(1).max(25),
});

/**
 * Create a campaign from a plan (BOLIV's propose_campaign or the UI). Lands in
 * status 'draft' — nothing executes until it's approved. operator+ only.
 */
export async function createCampaignAction(
  tenantId: string,
  input: z.infer<typeof createSchema>,
): Promise<CampaignActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    const et = await getTranslations("action_errors");
    return { ok: false, error: parsed.error.issues[0]?.message ?? et("invalid_data") };
  }

  const user = await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const svc = createServiceClient();
  const { data: camp, error: cErr } = await svc
    .from("campaigns")
    .insert({
      tenant_id: tenantId,
      title: parsed.data.title,
      goal: parsed.data.goal ?? null,
      budget_credits: parsed.data.budget_credits ?? null,
      status: "draft",
      created_by: user.id,
    } as never)
    .select("id")
    .single();
  if (cErr) return { ok: false, error: cErr.message };
  const campaignId = (camp as { id: string }).id;

  const stepRows = parsed.data.steps.map((s, i) => ({
    campaign_id: campaignId,
    tenant_id: tenantId,
    seq: i + 1,
    kind: s.kind,
    params: s.params ?? {},
    scheduled_at: s.scheduled_at ?? null,
    status: "pending",
  }));
  const { error: sErr } = await svc.from("campaign_steps").insert(stepRows as never);
  if (sErr) {
    // Roll back the campaign so we don't leave an empty shell.
    await svc.from("campaigns").delete().eq("id", campaignId).eq("tenant_id", tenantId);
    return { ok: false, error: sErr.message };
  }

  revalidatePath("/dashboard", "layout");
  return { ok: true, id: campaignId };
}

/** Approve a draft campaign so the tick engine may start executing it. */
export async function approveCampaignAction(
  tenantId: string,
  campaignId: string,
): Promise<CampaignActionResult> {
  const user = await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });
  const svc = createServiceClient();
  const { error } = await svc
    .from("campaigns")
    .update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString() } as never)
    .eq("id", campaignId)
    .eq("tenant_id", tenantId)
    .eq("status", "draft");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true, id: campaignId };
}

/** Pause / resume / cancel (kill switch). */
async function setCampaignStatus(
  tenantId: string,
  campaignId: string,
  status: "paused" | "approved" | "cancelled",
): Promise<CampaignActionResult> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });
  const svc = createServiceClient();
  const { error } = await svc
    .from("campaigns")
    .update({ status } as never)
    .eq("id", campaignId)
    .eq("tenant_id", tenantId)
    .not("status", "in", "(done,cancelled)");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true, id: campaignId };
}

export async function pauseCampaignAction(tenantId: string, id: string) {
  return setCampaignStatus(tenantId, id, "paused");
}
export async function resumeCampaignAction(tenantId: string, id: string) {
  return setCampaignStatus(tenantId, id, "approved");
}
export async function cancelCampaignAction(tenantId: string, id: string) {
  return setCampaignStatus(tenantId, id, "cancelled");
}
