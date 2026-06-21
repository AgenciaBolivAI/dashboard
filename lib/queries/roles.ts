import { createClient } from "@/lib/supabase/server";
import type { PermissionSet } from "@/lib/permissions";

export type CustomRole = {
  id: string;
  tenant_id: string;
  name: string;
  is_system: boolean;
  permissions: PermissionSet;
  created_at: string;
};

/** Custom roles defined by a tenant (the built-in tiers are virtual, in code). */
export async function listRoles(tenantId: string): Promise<CustomRole[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("roles")
    .select("id, tenant_id, name, is_system, permissions, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  return (data ?? []) as CustomRole[];
}

/** Map of member user_id → assigned custom role_id (null when on a legacy tier). */
export async function getMemberRoleIds(tenantId: string): Promise<Record<string, string | null>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dashboard_users")
    .select("user_id, role_id")
    .eq("tenant_id", tenantId);
  const out: Record<string, string | null> = {};
  for (const r of (data ?? []) as { user_id: string; role_id: string | null }[]) {
    out[r.user_id] = r.role_id;
  }
  return out;
}
