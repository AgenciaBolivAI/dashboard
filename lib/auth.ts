import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  permissionsForRole,
  levelSatisfies,
  type Feature,
  type Level,
  type Role,
  type PermissionSet,
} from "@/lib/permissions";

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
 * The auth provider the current user signed in with ("email", "google",
 * "facebook", …) or null if not signed in. OAuth-only users have no password,
 * so password-change UI should be hidden when this is not "email".
 */
export async function getAuthProvider(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return (user?.app_metadata?.provider as string | undefined) ?? null;
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

/**
 * The current user's effective FEATURE → LEVEL map for this tenant. Resolution
 * order: bolivai_admin → full admin; else a CUSTOM role (dashboard_users.role_id
 * → roles.permissions) if assigned; else the legacy tier preset. Returns {} for
 * a user with no membership.
 */
export async function getEffectivePermissions(tenantId: string): Promise<PermissionSet> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};
  if (await isBolivAIAdmin()) return permissionsForRole("bolivai_admin");

  const { data } = await supabase
    .from("dashboard_users")
    .select("role, role_id")
    .eq("user_id", user.id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) return {};
  const row = data as { role: string | null; role_id: string | null };

  if (row.role_id) {
    const { data: roleRow } = await supabase
      .from("roles")
      .select("permissions")
      .eq("id", row.role_id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const perms = (roleRow as { permissions?: PermissionSet } | null)?.permissions;
    if (perms && typeof perms === "object") return perms;
  }
  return permissionsForRole((row.role as Role) ?? null);
}

/**
 * True if the current user has at least `level` on `feature` for this tenant.
 * The permission-model counterpart to `requireTenantAccess({ minRole })`.
 * Honors custom roles (Phase 4 RBAC) via getEffectivePermissions.
 */
export async function hasPermission(
  tenantId: string,
  feature: Feature,
  level: Level,
): Promise<boolean> {
  const perms = await getEffectivePermissions(tenantId);
  return levelSatisfies(perms[feature] ?? "none", level);
}

/**
 * Throws (redirects) if the current user lacks `level` on `feature`.
 * Use in server actions / route handlers the way `requireTenantAccess` is used.
 */
export async function requirePermission(
  tenantId: string,
  feature: Feature,
  level: Level,
) {
  if (!(await hasPermission(tenantId, feature, level))) {
    redirect("/dashboard");
  }
}
