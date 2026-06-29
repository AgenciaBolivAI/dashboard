"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations, getLocale } from "next-intl/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { runProspectResearch } from "@/lib/prospect/research";
import { analyzeConversation } from "@/lib/prospect/sentiment";
import { AUTO_SOURCE_BUCKETS } from "@/lib/prospect/research";

export type ProspectActionResult = { ok: boolean; error?: string };

const idSchema = z.string().uuid();

/**
 * On-demand "Research with BOLIV" for a lead or customer. operator+ only. Runs
 * inline (the web-search call fits the route's maxDuration); the result is
 * written to prospect_research and the profile re-renders.
 */
async function research(
  tenantId: string,
  kind: "lead" | "customer",
  subjectId: string,
): Promise<ProspectActionResult> {
  const et = await getTranslations("action_errors");
  if (!idSchema.safeParse(subjectId).success) return { ok: false, error: et("invalid_data") };
  const user = await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const locale = await getLocale();
  const res = await runProspectResearch(tenantId, kind, subjectId, user.id, locale);
  if (!res.ok) {
    if (res.error === "insufficient_credits") return { ok: false, error: et("assistant_need_credit") };
    return { ok: false, error: et("prospect_research_failed") };
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function researchLeadAction(tenantId: string, leadId: string): Promise<ProspectActionResult> {
  return research(tenantId, "lead", leadId);
}

export async function researchCustomerAction(tenantId: string, customerId: string): Promise<ProspectActionResult> {
  return research(tenantId, "customer", customerId);
}

/** On-demand conversation sentiment + signals. operator+ only. */
export async function analyzeConversationAction(
  tenantId: string,
  conversationId: string,
): Promise<ProspectActionResult> {
  const et = await getTranslations("action_errors");
  if (!idSchema.safeParse(conversationId).success) return { ok: false, error: et("invalid_data") };
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const locale = await getLocale();
  const res = await analyzeConversation(tenantId, conversationId, locale);
  if (!res.ok) {
    if (res.error === "insufficient_credits") return { ok: false, error: et("assistant_need_credit") };
    if (res.error === "empty_conversation") return { ok: false, error: et("analysis_empty_conversation") };
    return { ok: false, error: et("analysis_failed") };
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/** Save the tenant's auto-research / sentiment settings. admin only. */
const settingsSchema = z.object({
  auto_research_enabled: z.boolean(),
  auto_sources: z.array(z.enum(AUTO_SOURCE_BUCKETS)),
  daily_cap: z.number().int().min(0).max(500),
  sentiment_auto_on_handoff: z.boolean(),
});

export async function updateProspectSettingsAction(
  tenantId: string,
  input: z.infer<typeof settingsSchema>,
): Promise<ProspectActionResult> {
  const et = await getTranslations("action_errors");
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: et("invalid_data") };
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const svc = createServiceClient() as unknown as SupabaseClient;
  const { error } = await svc.from("prospect_settings").upsert(
    {
      tenant_id: tenantId,
      auto_research_enabled: parsed.data.auto_research_enabled,
      auto_sources: parsed.data.auto_sources,
      daily_cap: parsed.data.daily_cap,
      sentiment_auto_on_handoff: parsed.data.sentiment_auto_on_handoff,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
