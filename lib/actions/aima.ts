"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { isColdOutreachAttested, COLD_OUTREACH_BLOCKED_MSG } from "@/lib/aima/consent";

export type AimaState = { error: string | null; success?: boolean };

const SOURCE_VALUES = [
  "yellow_pages",
  "google_maps",
  "web_directory",
  "apollo",
] as const;

const settingsSchema = z.object({
  scraper_enabled: z.boolean().optional(),
  scraper_sources: z.array(z.enum(SOURCE_VALUES)).max(10).optional(),
  scraper_concurrency: z.coerce.number().int().min(1).max(50).optional(),
  scraper_max_per_run: z.coerce.number().int().min(10).max(5000).optional(),
  scraper_proxy_url: z.string().trim().max(500).nullable().optional(),
  scraper_proxy_token: z.string().trim().max(500).nullable().optional(),
  google_maps_api_key: z.string().trim().max(500).nullable().optional(),
  apollo_enabled: z.boolean().optional(),
  apollo_api_key: z.string().trim().max(500).nullable().optional(),
  cold_email_enabled: z.boolean().optional(),
  instantly_api_key: z.string().trim().max(500).nullable().optional(),
  instantly_campaign_id: z.string().trim().max(200).nullable().optional(),
  cold_email_daily_cap: z.coerce.number().int().min(1).max(2000).optional(),
  target_verticals: z.array(z.string().trim().max(60)).max(20).optional(),
  target_geographies: z.array(z.string().trim().max(120)).max(120).optional(),
  email_enrichment_enabled: z.boolean().optional(),
});

export async function updateAimaSettingsAction(
  tenantId: string,
  fields: z.infer<typeof settingsSchema>,
): Promise<AimaState> {
  const et = await getTranslations("action_errors");
  const parsed = settingsSchema.safeParse(fields);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? et("invalid_data") };
  }

  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const svc = createServiceClient();
  // Upsert so this works even if the row got cleared.
  const { error } = await svc
    .from("aima_settings")
    .upsert(
      {
        tenant_id: tenantId,
        ...parsed.data,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "tenant_id" },
    );

  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

/**
 * Fire-and-forget trigger to start a scrape run NOW. The actual scraper
 * lives in n8n; we just poke the webhook so the workflow runs immediately
 * instead of waiting for the next cron tick. Mirrors the CCAVAI trigger.
 */
export async function triggerAimaScrapeAction(
  tenantId: string,
): Promise<AimaState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  // Cold-outreach lawful-basis gate — block the scrape until a tenant admin attests.
  if (!(await isColdOutreachAttested(tenantId))) {
    return { error: COLD_OUTREACH_BLOCKED_MSG };
  }

  const url = process.env.AIMA_WEBHOOK_URL;
  const secret = process.env.AIMA_WEBHOOK_SECRET;
  if (!url || !secret) {
    const et = await getTranslations("action_errors");
    return {
      error: et("aima_webhook_not_configured"),
    };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ tenant_id: tenantId }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return { error: `Webhook respondió ${res.status}` };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("timeout") || msg.includes("aborted")) {
      return { error: null, success: true };
    }
    return { error: msg };
  }

  return { error: null, success: true };
}

/**
 * Record (or revoke) the tenant's attestation that it has a lawful basis to
 * contact the businesses AIMA targets and Sandra cold-calls. Admin-only. Until
 * this is set, triggerAimaScrapeAction + the campaign engine refuse cold outreach.
 */
export async function attestColdOutreachAction(
  tenantId: string,
  attested: boolean,
): Promise<AimaState> {
  const user = await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const svc = createServiceClient();
  const { error } = await svc.from("aima_settings").upsert(
    {
      tenant_id: tenantId,
      cold_outreach_attested_at: attested ? new Date().toISOString() : null,
      cold_outreach_attested_by: attested ? (user.email ?? null) : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );
  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

/**
 * Abort any currently-running scrape: flips scraper_enabled OFF + marks
 * any 'running' rows in aima_scrape_runs as 'aborted'. The n8n workflow
 * checks the flag at the start of each batch and self-terminates.
 */
export async function abortAimaScrapeAction(
  tenantId: string,
): Promise<AimaState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const svc = createServiceClient();
  const now = new Date().toISOString();

  const settingsP = svc
    .from("aima_settings")
    .update({ scraper_enabled: false, updated_at: now })
    .eq("tenant_id", tenantId);

  const runsP = svc
    .from("aima_scrape_runs")
    .update({ status: "aborted", finished_at: now })
    .eq("tenant_id", tenantId)
    .eq("status", "running");

  const [{ error: settingsErr }, { error: runsErr }] = await Promise.all([
    settingsP,
    runsP,
  ]);
  if (settingsErr) return { error: settingsErr.message };
  if (runsErr) return { error: runsErr.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}
