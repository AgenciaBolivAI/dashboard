"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser, requireTenantAccess } from "@/lib/auth";

export type TeamState = {
  error: string | null;
  success?: boolean;
  inviteUrl?: string;
};

const ROLES = ["owner", "admin", "operator", "viewer", "member"] as const;

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
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const user = await requireUser();
  await requireTenantAccess(parsed.data.tenant_id, { minRole: "admin" });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitations")
    .insert({
      tenant_id: parsed.data.tenant_id,
      email: parsed.data.email.toLowerCase(),
      role: parsed.data.role,
      invited_by: user.id,
    })
    .select("token")
    .single();

  if (error) return { error: error.message };

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

  const supabase = await createClient();
  const { error } = await supabase
    .from("invitations")
    .delete()
    .eq("id", invitationId)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };

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
  const parsed = roleUpdateSchema.safeParse({ tenant_id: tenantId, user_id: userId, role });
  if (!parsed.success) return { error: "Datos inválidos" };

  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const supabase = await createClient();
  const { error } = await supabase
    .from("dashboard_users")
    .update({ role })
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
  const me = await requireUser();
  if (me.id === userId) {
    return { error: "No puedes quitarte a ti mismo" };
  }
  await requireTenantAccess(tenantId, { minRole: "admin" });

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
