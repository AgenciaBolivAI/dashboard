import { createServiceClient } from "@/lib/supabase/service";

/**
 * Find a users row by phone for a tenant, or create one. Used by
 * tools that need to attribute a reservation/lead to a stable user_id
 * even when the caller has never interacted before.
 */
export async function ensureUserByPhone(
  tenantId: string,
  phone: string,
  name?: string,
): Promise<string> {
  const supabase = createServiceClient();
  const normalized = phone.replace(/^\+/, "");
  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("whatsapp_number", normalized)
    .maybeSingle();
  if (existing) {
    return (existing as { id: string }).id;
  }
  const { data: created, error } = await supabase
    .from("users")
    .insert({
      tenant_id: tenantId,
      whatsapp_number: normalized,
      name: name ?? null,
    })
    .select("id")
    .single();
  if (error || !created) {
    throw new Error(`Could not create user row: ${error?.message ?? "unknown"}`);
  }
  return (created as { id: string }).id;
}
