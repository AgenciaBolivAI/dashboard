"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";

export type SmsSettingsResult = { ok: boolean; error?: string };

const schema = z.object({
  provider: z.enum(["twilio", "http_gateway"]),
  gateway_url: z.string().trim().max(1000).optional().nullable(),
  gateway_method: z.enum(["GET", "POST"]).optional(),
  gateway_content_type: z.enum(["json", "form"]).optional(),
  gateway_body_template: z.string().trim().max(4000).optional().nullable(),
  gateway_from: z.string().trim().max(60).optional().nullable(),
  // Optional: only overwrite the stored auth header when a non-empty value is sent.
  gateway_auth_header: z.string().trim().max(2000).optional().nullable(),
});

/**
 * Save a tenant's SMS provider config. operator+ only. When the http_gateway
 * provider is selected, a URL is required. The auth header is write-only: a blank
 * value leaves the stored secret untouched (so re-saving the form doesn't wipe it).
 */
export async function saveSmsSettingsAction(
  tenantId: string,
  input: z.infer<typeof schema>,
): Promise<SmsSettingsResult> {
  const et = await getTranslations("action_errors");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? et("invalid_data") };

  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const d = parsed.data;
  if (d.provider === "http_gateway" && !(d.gateway_url ?? "").trim()) {
    return { ok: false, error: et("sms_gateway_url_required") };
  }

  const patch: Record<string, unknown> = {
    tenant_id: tenantId,
    provider: d.provider,
    gateway_url: d.gateway_url?.trim() || null,
    gateway_method: d.gateway_method ?? "POST",
    gateway_content_type: d.gateway_content_type ?? "json",
    gateway_body_template: d.gateway_body_template?.trim() || null,
    gateway_from: d.gateway_from?.trim() || null,
  };
  // Only set the secret when a fresh value is provided.
  const newAuth = (d.gateway_auth_header ?? "").trim();
  if (newAuth) patch.gateway_auth_header = newAuth;

  const svc = createServiceClient() as unknown as SupabaseClient;
  const { error } = await svc.from("tenant_sms_settings").upsert(patch, { onConflict: "tenant_id" });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
