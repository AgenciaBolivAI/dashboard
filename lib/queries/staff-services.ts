import { createClient } from "@/lib/supabase/server";

/**
 * Returns a map of service_id → staff_id[] for a tenant.
 * Used to pre-check the staff multi-select in the service edit dialog.
 */
export async function getServiceStaffMap(
  tenantId: string,
): Promise<Record<string, string[]>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_services")
    .select("service_id, staff_id")
    .eq("tenant_id", tenantId);

  const map: Record<string, string[]> = {};
  for (const row of (data ?? []) as { service_id: string; staff_id: string }[]) {
    if (!map[row.service_id]) map[row.service_id] = [];
    map[row.service_id].push(row.staff_id);
  }
  return map;
}

/**
 * Returns a map of staff_id → service_id[] for a tenant.
 * Used to pre-check the service multi-select in the staff edit dialog.
 */
export async function getStaffServiceMap(
  tenantId: string,
): Promise<Record<string, string[]>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("staff_services")
    .select("staff_id, service_id")
    .eq("tenant_id", tenantId);

  const map: Record<string, string[]> = {};
  for (const row of (data ?? []) as { staff_id: string; service_id: string }[]) {
    if (!map[row.staff_id]) map[row.staff_id] = [];
    map[row.staff_id].push(row.service_id);
  }
  return map;
}
