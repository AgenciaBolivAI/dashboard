"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { refreshAccessToken, revokeToken } from "@/lib/google";

export type IntegrationState = { error: string | null; success?: boolean };

// ─── Disconnect ──────────────────────────────────────────────────────
export async function disconnectGoogleAction(
  tenantId: string,
): Promise<IntegrationState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const svc = createServiceClient();
  const { data: row } = await svc
    .from("tenant_integrations")
    .select("access_token, refresh_token")
    .eq("tenant_id", tenantId)
    .eq("provider", "google")
    .maybeSingle();

  // Best-effort revoke at Google's side (so the user sees BolivAI removed
  // from their account permissions list)
  const tokens = row as
    | { access_token: string | null; refresh_token: string | null }
    | null;
  if (tokens?.refresh_token) await revokeToken(tokens.refresh_token);
  else if (tokens?.access_token) await revokeToken(tokens.access_token);

  const { error } = await svc
    .from("tenant_integrations")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("provider", "google");

  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

// ─── Update metadata (calendar_id, spreadsheet_id, etc.) ─────────────
const metadataSchema = z.object({
  tenant_id: z.string().uuid(),
  calendar_id: z.string().optional(),
  spreadsheet_id: z.string().optional(),
  sheet_range: z.string().optional(),
  sender_email: z.string().email().optional().or(z.literal("")),
});

export async function updateGoogleMetadataAction(
  _prev: IntegrationState,
  formData: FormData,
): Promise<IntegrationState> {
  const et = await getTranslations("action_errors");
  const parsed = metadataSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? et("invalid_data") };
  }

  await requireUser();
  await requireTenantAccess(parsed.data.tenant_id, { minRole: "admin" });

  const svc = createServiceClient();
  const { data: existing } = await svc
    .from("tenant_integrations")
    .select("metadata")
    .eq("tenant_id", parsed.data.tenant_id)
    .eq("provider", "google")
    .maybeSingle();

  const current = (existing as { metadata?: Record<string, unknown> } | null)?.metadata ?? {};
  const next: Record<string, unknown> = { ...current };

  // Only overwrite keys that were actually submitted
  if (parsed.data.calendar_id !== undefined)
    next.calendar_id = parsed.data.calendar_id || "primary";
  if (parsed.data.spreadsheet_id !== undefined)
    next.spreadsheet_id = parsed.data.spreadsheet_id || null;
  if (parsed.data.sheet_range !== undefined)
    next.sheet_range = parsed.data.sheet_range || "Leads!A:F";
  if (parsed.data.sender_email !== undefined)
    next.sender_email = parsed.data.sender_email || null;

  const { error } = await svc
    .from("tenant_integrations")
    .update({ metadata: next as never })
    .eq("tenant_id", parsed.data.tenant_id)
    .eq("provider", "google");

  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

// ─── Refresh access token (admin-triggered) ──────────────────────────
export async function refreshGoogleTokenAction(
  tenantId: string,
): Promise<IntegrationState> {
  const et = await getTranslations("action_errors");
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const svc = createServiceClient();
  const { data: row } = await svc
    .from("tenant_integrations")
    .select("refresh_token")
    .eq("tenant_id", tenantId)
    .eq("provider", "google")
    .maybeSingle();

  const refresh = (row as { refresh_token: string | null } | null)?.refresh_token;
  if (!refresh) {
    return { error: et("google_no_refresh_token") };
  }

  try {
    const fresh = await refreshAccessToken(refresh);
    await svc
      .from("tenant_integrations")
      .update({
        access_token: fresh.access_token,
        expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
        scope: fresh.scope,
      })
      .eq("tenant_id", tenantId)
      .eq("provider", "google");
  } catch (e) {
    return { error: e instanceof Error ? e.message : et("google_refresh_failed") };
  }

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}
