"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { chargeSeatForInvite, refundSeatForInvite, currentPeriod } from "@/lib/billing/seats";

export type TeamState = {
  error: string | null;
  success?: boolean;
  inviteUrl?: string;
};

const ROLES = ["owner", "admin", "operator", "viewer", "member"] as const;

/** Count of owner-tier members on a tenant (service client — bypasses RLS). */
async function countOwners(tenantId: string): Promise<number> {
  const svc = createServiceClient();
  const { count } = await svc
    .from("dashboard_users")
    .select("user_id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("role", "owner");
  return count ?? 0;
}

/** A member's current legacy role tier (service client). */
async function memberRole(tenantId: string, userId: string): Promise<string | null> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("dashboard_users")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { role: string | null } | null)?.role ?? null;
}

// ─── Invite a user ───────────────────────────────────────────────────
const inviteSchema = z.object({
  tenant_id: z.string().uuid(),
  email: z.string().email("Email inválido"),
  role: z.enum(ROLES),
});

export async function inviteUserAction(
  _prev: TeamState,
  formData: FormData,
): Promise<TeamState> {
  const t = await getTranslations("team");
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: t("err_invalid") };
  }

  const user = await requireUser();
  await requireTenantAccess(parsed.data.tenant_id, { minRole: "admin" });

  // Seat billing: a billable seat (beyond the 2 included) is charged US$5/mo
  // = 500 credits NOW. Block the invite if the prepaid balance can't cover it.
  const seat = await chargeSeatForInvite(parsed.data.tenant_id);
  if (!seat.ok) {
    return { error: t("err_seat_insufficient") };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .insert({
      tenant_id: parsed.data.tenant_id,
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      invited_by: user.id,
      seat_charged: seat.charged,
    } as never)
    .select("token")
    .single();

  if (error) {
    // Roll back the seat charge if we charged for this now-failed invite.
    if (seat.charged) await refundSeatForInvite(parsed.data.tenant_id, currentPeriod());
    return { error: error.message };
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const inviteUrl = `${base}/invitations/${(data as { token: string }).token}`;

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true, inviteUrl };
}

// ─── Revoke a pending invitation ─────────────────────────────────────
export async function revokeInvitationAction(
  tenantId: string,
  invitationId: string,
): Promise<TeamState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  // Look up the seat-charge state BEFORE deleting so we can refund a charged,
  // still-pending invite revoked in the same month (a seat never used).
  const svc = createServiceClient();
  const { data: inv } = await svc
    .from("invitations")
    .select("created_at, seat_charged, accepted_at")
    .eq("id", invitationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const supabase = await createClient();
  const { error } = await supabase
    .from("invitations")
    .delete()
    .eq("id", invitationId)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };

  const row = inv as { created_at: string; seat_charged: boolean; accepted_at: string | null } | null;
  if (row?.seat_charged && !row.accepted_at) {
    await refundSeatForInvite(tenantId, row.created_at.slice(0, 7), invitationId);
  }

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

// ─── Update a member's role ──────────────────────────────────────────
const roleUpdateSchema = z.object({
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
  role: z.enum(ROLES),
});

export async function updateMemberRoleAction(
  tenantId: string,
  userId: string,
  role: (typeof ROLES)[number],
): Promise<TeamState> {
  const t = await getTranslations("team");
  const parsed = roleUpdateSchema.safeParse({ tenant_id: tenantId, user_id: userId, role });
  if (!parsed.success) return { error: t("err_invalid") };

  await requireUser();
  // Minting an owner requires the caller to BE an owner — an admin can't grant a
  // tier above their own.
  await requireTenantAccess(tenantId, { minRole: role === "owner" ? "owner" : "admin" });

  // Don't strip the last owner: if this change demotes the only remaining owner,
  // refuse (the tenant must always have at least one owner).
  if (role !== "owner") {
    const current = await memberRole(tenantId, userId);
    if (current === "owner" && (await countOwners(tenantId)) <= 1) {
      return { error: t("err_last_owner") };
    }
  }

  const supabase = await createClient();
  // Clear any custom role_id so the chosen tier actually takes effect (a set
  // role_id overrides the tier in getEffectivePermissions).
  const { error } = await supabase
    .from("dashboard_users")
    .update({ role, role_id: null } as never)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

// ─── Remove a member ─────────────────────────────────────────────────
export async function removeMemberAction(
  tenantId: string,
  userId: string,
): Promise<TeamState> {
  const t = await getTranslations("team");
  const me = await requireUser();
  if (me.id === userId) {
    return { error: t("err_cannot_remove_self") };
  }
  await requireTenantAccess(tenantId, { minRole: "admin" });

  // Don't remove the last owner.
  if ((await memberRole(tenantId, userId)) === "owner" && (await countOwners(tenantId)) <= 1) {
    return { error: t("err_last_owner") };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("dashboard_users")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("user_id", userId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

// ─── Server-side helper to load members + their auth emails ──────────
export type Member = {
  user_id: string;
  email: string;
  role: string;
  joined_at: string;
  is_self: boolean;
};

export type PendingInvitation = {
  id: string;
  email: string;
  role: string;
  token: string;
  expires_at: string;
  created_at: string;
};

export async function loadTeam(tenantId: string): Promise<{
  members: Member[];
  invitations: PendingInvitation[];
}> {
  await requireUser();
  await requireTenantAccess(tenantId);

  const me = await requireUser();
  const supabase = await createClient();
  const svc = createServiceClient();

  const [{ data: rows }, { data: invitations }] = await Promise.all([
    supabase
      .from("dashboard_users")
      .select("user_id, role, created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true }),
    supabase
      .from("invitations")
      .select("id, email, role, token, expires_at, created_at")
      .eq("tenant_id", tenantId)
      .is("accepted_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
  ]);

  const members: Member[] = [];
  for (const r of (rows ?? []) as { user_id: string; role: string; created_at: string }[]) {
    const { data: authUser } = await svc.auth.admin.getUserById(r.user_id);
    members.push({
      user_id: r.user_id,
      email: authUser?.user?.email ?? "—",
      role: r.role,
      joined_at: r.created_at,
      is_self: r.user_id === me.id,
    });
  }

  return {
    members,
    invitations: (invitations ?? []) as PendingInvitation[],
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Employee groups + credit budgets (schema-step32)
// ═══════════════════════════════════════════════════════════════════════
// These tables aren't in the generated Database types until `npm run db:types`
// runs after the migration is applied — use a loosely-typed service client.
function looseSvc(): SupabaseClient {
  return createServiceClient() as unknown as SupabaseClient;
}

export type EmployeeGroup = {
  id: string;
  name: string;
  description: string | null;
  member_ids: string[];
};

export type CreditBudget = {
  id: string;
  scope_type: "user" | "group";
  scope_id: string;
  period: "monthly" | "one_time";
  allocated_credits: number;
  spent_credits: number;
  enabled: boolean;
};

/** Groups (with their member ids) + budgets for the team page. Admin-gated. */
export async function loadTeamBudgets(tenantId: string): Promise<{
  groups: EmployeeGroup[];
  budgets: CreditBudget[];
}> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });
  const svc = looseSvc();

  const [{ data: groups }, { data: gm }, { data: budgets }] = await Promise.all([
    svc.from("employee_groups").select("id, name, description").eq("tenant_id", tenantId).order("name"),
    svc.from("employee_group_members").select("group_id, user_id").eq("tenant_id", tenantId),
    svc
      .from("credit_budgets")
      .select("id, scope_type, scope_id, period, allocated_credits, spent_credits, enabled")
      .eq("tenant_id", tenantId),
  ]);

  const byGroup = new Map<string, string[]>();
  for (const m of (gm ?? []) as { group_id: string; user_id: string }[]) {
    const arr = byGroup.get(m.group_id) ?? [];
    arr.push(m.user_id);
    byGroup.set(m.group_id, arr);
  }

  return {
    groups: ((groups ?? []) as { id: string; name: string; description: string | null }[]).map((g) => ({
      ...g,
      member_ids: byGroup.get(g.id) ?? [],
    })),
    budgets: (budgets ?? []) as CreditBudget[],
  };
}

// ─── Create / delete a group ─────────────────────────────────────────
const groupSchema = z.object({
  tenant_id: z.string().uuid(),
  name: z.string().trim().min(1, "Nombre requerido").max(60),
  description: z.string().trim().max(200).optional(),
});

export async function createGroupAction(_prev: TeamState, formData: FormData): Promise<TeamState> {
  const t = await getTranslations("team");
  const parsed = groupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: t("err_invalid") };
  await requireUser();
  await requireTenantAccess(parsed.data.tenant_id, { minRole: "admin" });

  const { error } = await looseSvc().from("employee_groups").insert({
    tenant_id: parsed.data.tenant_id,
    name: parsed.data.name,
    description: parsed.data.description || null,
  });
  if (error) {
    return {
      error: /duplicate|unique/i.test(error.message) ? t("err_group_name_taken") : error.message,
    };
  }
  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

export async function deleteGroupAction(tenantId: string, groupId: string): Promise<TeamState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });
  const svc = looseSvc();
  // Drop the group's budget first; member rows cascade with the group.
  await svc
    .from("credit_budgets")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("scope_type", "group")
    .eq("scope_id", groupId);
  const { error } = await svc.from("employee_groups").delete().eq("id", groupId).eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

// ─── Assign / unassign a member to a group (a user is in <= 1 group) ──
export async function assignMemberAction(
  tenantId: string,
  groupId: string,
  userId: string,
): Promise<TeamState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });
  const { error } = await looseSvc()
    .from("employee_group_members")
    .upsert(
      { tenant_id: tenantId, group_id: groupId, user_id: userId },
      { onConflict: "tenant_id,user_id" },
    );
  if (error) return { error: error.message };
  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

export async function unassignMemberAction(tenantId: string, userId: string): Promise<TeamState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });
  const { error } = await looseSvc()
    .from("employee_group_members")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("user_id", userId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

// ─── Set / remove a budget (user OR group; never both) ───────────────
const budgetSchema = z.object({
  tenant_id: z.string().uuid(),
  scope_type: z.enum(["user", "group"]),
  scope_id: z.string().uuid(),
  period: z.enum(["monthly", "one_time"]),
  allocated_credits: z.coerce.number().int().min(0).max(100_000_000),
});

export async function setBudgetAction(input: {
  tenantId: string;
  scopeType: "user" | "group";
  scopeId: string;
  period: "monthly" | "one_time";
  allocatedCredits: number;
}): Promise<TeamState> {
  const parsed = budgetSchema.safeParse({
    tenant_id: input.tenantId,
    scope_type: input.scopeType,
    scope_id: input.scopeId,
    period: input.period,
    allocated_credits: input.allocatedCredits,
  });
  const t = await getTranslations("team");
  if (!parsed.success) return { error: t("err_invalid") };
  await requireUser();
  await requireTenantAccess(input.tenantId, { minRole: "admin" });
  const svc = looseSvc();

  // Enforce "never both": a member can't have a personal budget AND sit in a
  // budgeted group.
  if (input.scopeType === "user") {
    const { data: gm } = await svc
      .from("employee_group_members")
      .select("group_id")
      .eq("tenant_id", input.tenantId)
      .eq("user_id", input.scopeId)
      .maybeSingle();
    const groupId = (gm as { group_id: string } | null)?.group_id;
    if (groupId) {
      const { data: gb } = await svc
        .from("credit_budgets")
        .select("id")
        .eq("tenant_id", input.tenantId)
        .eq("scope_type", "group")
        .eq("scope_id", groupId)
        .eq("enabled", true)
        .maybeSingle();
      if (gb) {
        return { error: t("err_personal_in_budgeted_team") };
      }
    }
  } else {
    const { data: gm } = await svc
      .from("employee_group_members")
      .select("user_id")
      .eq("tenant_id", input.tenantId)
      .eq("group_id", input.scopeId);
    const ids = ((gm ?? []) as { user_id: string }[]).map((x) => x.user_id);
    if (ids.length) {
      const { data: pb } = await svc
        .from("credit_budgets")
        .select("id")
        .eq("tenant_id", input.tenantId)
        .eq("scope_type", "user")
        .eq("enabled", true)
        .in("scope_id", ids)
        .limit(1);
      if (pb && (pb as unknown[]).length) {
        return { error: t("err_team_member_has_personal") };
      }
    }
  }

  // Update if a budget already exists (preserve spent_credits mid-period),
  // otherwise insert a fresh one.
  const { data: existing } = await svc
    .from("credit_budgets")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("scope_type", input.scopeType)
    .eq("scope_id", input.scopeId)
    .maybeSingle();

  if (existing) {
    const { error } = await svc
      .from("credit_budgets")
      .update({ period: input.period, allocated_credits: input.allocatedCredits, enabled: true })
      .eq("id", (existing as { id: string }).id);
    if (error) return { error: error.message };
  } else {
    const { error } = await svc.from("credit_budgets").insert({
      tenant_id: input.tenantId,
      scope_type: input.scopeType,
      scope_id: input.scopeId,
      period: input.period,
      allocated_credits: input.allocatedCredits,
    });
    if (error) return { error: error.message };
  }
  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

export async function removeBudgetAction(tenantId: string, budgetId: string): Promise<TeamState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });
  const { error } = await looseSvc()
    .from("credit_budgets")
    .delete()
    .eq("id", budgetId)
    .eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}
