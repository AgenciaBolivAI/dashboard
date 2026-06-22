"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { generateApiKey } from "@/lib/security/api-key";

export type ApiKeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  last_four: string;
  created_at: string;
  last_used_at: string | null;
};

function svc(): SupabaseClient {
  return createServiceClient() as unknown as SupabaseClient;
}

/** Active keys (metadata only — never the hash). Admin-only. */
export async function listApiKeys(tenantId: string): Promise<ApiKeyRow[]> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });
  const { data } = await svc()
    .from("tenant_api_keys")
    .select("id, name, key_prefix, last_four, created_at, last_used_at")
    .eq("tenant_id", tenantId)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });
  return (data ?? []) as ApiKeyRow[];
}

/** Mint a key. The plaintext is returned ONCE and never stored. Admin-only. */
export async function createApiKeyAction(
  tenantId: string,
  name?: string,
): Promise<{ error: string | null; plaintext?: string }> {
  const user = await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });
  const et = await getTranslations("action_errors");

  const { count } = await svc()
    .from("tenant_api_keys")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .is("revoked_at", null);
  if ((count ?? 0) >= 10) return { error: et("api_key_limit") };

  const g = generateApiKey();
  const { error } = await svc().from("tenant_api_keys").insert({
    tenant_id: tenantId,
    name: (name?.trim() || "API key").slice(0, 60),
    key_hash: g.hash,
    key_prefix: g.prefix,
    last_four: g.lastFour,
    created_by: user.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, plaintext: g.plaintext };
}

/** Revoke (soft-delete) a key. Admin-only. */
export async function revokeApiKeyAction(
  tenantId: string,
  keyId: string,
): Promise<{ error: string | null }> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });
  const { error } = await svc()
    .from("tenant_api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", keyId)
    .eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard", "layout");
  return { error: null };
}
