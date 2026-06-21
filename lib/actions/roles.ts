"use server";

import { revalidatePath } from "next/cache";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { FEATURES, LEVELS, type Feature, type Level, type PermissionSet } from "@/lib/permissions";

export type RoleActionResult = { ok: boolean; error?: string; id?: string };

const FEATURE_SET = new Set<string>(FEATURES);
const LEVEL_SET = new Set<string>(LEVELS);

/** Keep only valid feature→level pairs; drop "none" (absence = none). */
function sanitizePermissions(input: unknown): PermissionSet {
  const out: PermissionSet = {};
  if (!input || typeof input !== "object") return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (FEATURE_SET.has(k) && typeof v === "string" && LEVEL_SET.has(v) && v !== "none") {
      out[k as Feature] = v as Level;
    }
  }
  return out;
}

export async function createRoleAction(
  tenantId: string,
  name: string,
  permissions: PermissionSet,
): Promise<RoleActionResult> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });
  const clean = name.trim().slice(0, 60);
  if (!clean) return { ok: false, error: "El nombre del rol es obligatorio" };

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("roles")
    .insert({ tenant_id: tenantId, name: clean, permissions: sanitizePermissions(permissions) } as never)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true, id: (data as { id: string }).id };
}

export async function updateRoleAction(
  tenantId: string,
  roleId: string,
  patch: { name?: string; permissions?: PermissionSet },
): Promise<RoleActionResult> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const fields: Record<string, unknown> = {};
  if (typeof patch.name === "string") {
    const clean = patch.name.trim().slice(0, 60);
    if (!clean) return { ok: false, error: "El nombre del rol es obligatorio" };
    fields.name = clean;
  }
  if (patch.permissions) fields.permissions = sanitizePermissions(patch.permissions);
  if (Object.keys(fields).length === 0) return { ok: true, id: roleId };

  const svc = createServiceClient();
  const { error } = await svc.from("roles").update(fields as never).eq("id", roleId).eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true, id: roleId };
}

export async function deleteRoleAction(tenantId: string, roleId: string): Promise<RoleActionResult> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });
  const svc = createServiceClient();
  // Members on this role fall back to their legacy tier (FK is ON DELETE SET NULL).
  const { error } = await svc.from("roles").delete().eq("id", roleId).eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/**
 * Assign a member a custom role (roleId) or clear it (null → back to their
 * legacy tier). Tenant-scoped; admin only.
 */
export async function assignRoleAction(
  tenantId: string,
  userId: string,
  roleId: string | null,
): Promise<RoleActionResult> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });
  const svc = createServiceClient();
  const { error } = await svc
    .from("dashboard_users")
    .update({ role_id: roleId } as never)
    .eq("user_id", userId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
