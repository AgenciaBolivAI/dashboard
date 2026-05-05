import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type DashboardRole = "owner" | "admin" | "operator" | "viewer" | "member";
export type EffectiveRole = DashboardRole | "bolivai_admin";

/**
 * Returns the current auth.users row, or redirects to /login if not signed in.
 */
export async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Returns the user (or null) without redirecting.
 */
export async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Returns true if the current user is in the bolivai_admins table.
 */
export async function isBolivAIAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase
    .from("bolivai_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return !!data;
}

/**
 * Returns the role the current user has on a tenant, or null if no membership.
 * BolivAI admins always return 'bolivai_admin'.
 */
export async function getRoleOnTenant(tenantId: string): Promise<EffectiveRole | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  if (await isBolivAIAdmin()) return "bolivai_admin";

  const { data } = await supabase
    .from("dashboard_users")
    .select("role")
    .eq("user_id", user.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return (data?.role as DashboardRole) ?? null;
}

/**
 * Throws (404) if the user has no access to this tenant.
 * Optionally enforces a minimum role.
 */
export async function requireTenantAccess(
  tenantId: string,
  options?: { minRole?: DashboardRole | "bolivai_admin" },
) {
  const role = await getRoleOnTenant(tenantId);
  if (!role) redirect("/dashboard");

  if (options?.minRole) {
    const order: EffectiveRole[] = [
      "viewer", "member", "operator", "admin", "owner", "bolivai_admin",
    ];
    if (order.indexOf(role) < order.indexOf(options.minRole)) {
      redirect(`/dashboard`); // or a "forbidden" page
    }
  }

  return role;
}

/**
 * For /admin/* routes — redirects non-staff to /dashboard.
 */
export async function requireBolivAIAdmin() {
  const isAdmin = await isBolivAIAdmin();
  if (!isAdmin) redirect("/dashboard");
}
