"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser, requireBolivAIAdmin } from "@/lib/auth";
import { getTemplate, getGateway, type GatewayId } from "@/lib/templates";

export type AdminState = { error: string | null; success?: boolean; slug?: string };

const slugRegex = /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/;

const createSchema = z.object({
  name: z.string().trim().min(2, "Nombre muy corto").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(slugRegex, "Slug inválido (sólo a-z, 0-9, guiones)"),
  industry: z.string().optional(),
  language: z.string().min(2).default("es"),
  timezone: z.string().min(1).default("UTC"),
  workflow_template: z.string().default("physio"),
  gateway: z.enum(["evolution", "meta_whatsapp", "twilio"]).default("evolution"),
  gateway_config_json: z.string().optional(),
});

export async function createTenantAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const user = await requireUser();
  await requireBolivAIAdmin();

  const svc = createServiceClient();

  // Check slug uniqueness
  const { data: existing } = await svc
    .from("tenants")
    .select("id")
    .eq("slug", parsed.data.slug)
    .maybeSingle();
  if (existing) return { error: "Ese slug ya está en uso" };

  // Resolve template & seed prompt from registry
  const template = getTemplate(parsed.data.workflow_template);
  const gateway = getGateway(parsed.data.gateway);

  let gatewayConfig: Record<string, unknown> = {};
  if (parsed.data.gateway_config_json) {
    try {
      gatewayConfig = JSON.parse(parsed.data.gateway_config_json);
    } catch {
      return { error: "gateway_config inválido" };
    }
  }

  // Validate required gateway fields
  for (const f of gateway.configFields) {
    if (f.required && !gatewayConfig[f.key]) {
      return { error: `Falta ${f.label} en la configuración del gateway` };
    }
  }

  // Seed prompt + variables from the template; the tenant can edit later.
  const seededVariables = {
    ...template.promptVariables,
    company_name: parsed.data.name,
  };

  const { data: tenantInsert, error: insertErr } = await svc
    .from("tenants")
    .insert({
      slug: parsed.data.slug,
      name: parsed.data.name,
      industry: parsed.data.industry || template.vertical,
      language: parsed.data.language,
      timezone: parsed.data.timezone,
      plan: "starter",
      status: "active",
      workflow_template: parsed.data.workflow_template,
      gateway: parsed.data.gateway,
      gateway_config: gatewayConfig as never,
      prompt_template: template.promptTemplate,
      prompt_variables: seededVariables as never,
    })
    .select("id, slug")
    .single();

  if (insertErr || !tenantInsert) {
    console.error("[admin.createTenant] tenant insert failed:", insertErr);
    return { error: insertErr?.message ?? "No se pudo crear el tenant" };
  }

  const tenantId = (tenantInsert as { id: string; slug: string }).id;
  const tenantSlug = (tenantInsert as { id: string; slug: string }).slug;

  // Add the creating admin as owner so the tenant switcher picks it up
  const { error: duErr } = await svc.from("dashboard_users").insert({
    user_id: user.id,
    tenant_id: tenantId,
    role: "owner",
  });
  if (duErr) {
    console.error("[admin.createTenant] dashboard_users insert failed:", duErr);
    // Roll back the tenant so the admin can retry cleanly
    await svc.from("tenants").delete().eq("id", tenantId);
    return {
      error: `No se pudo asignar membresía: ${duErr.message}. Tenant revertido.`,
    };
  }

  // Bootstrap a starter subscription row (trialing) — non-fatal if it fails
  const { error: subErr } = await svc.from("subscriptions").insert({
    tenant_id: tenantId,
    plan: "starter",
    status: "trialing",
    trial_ends_at: new Date(Date.now() + 14 * 86400 * 1000).toISOString(),
  });
  if (subErr) {
    console.error("[admin.createTenant] subscription insert failed:", subErr);
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath("/admin");
  redirect(`/dashboard/${tenantSlug}/overview`);
}

export async function suspendTenantAction(
  tenantId: string,
  paused: boolean,
): Promise<AdminState> {
  await requireBolivAIAdmin();
  const svc = createServiceClient();
  const { error } = await svc
    .from("tenants")
    .update({ status: paused ? "paused" : "active" })
    .eq("id", tenantId);
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

// ─── Update tenant from admin panel ──────────────────────────────────
const updateTenantSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  industry: z.string().optional(),
  language: z.string().min(2),
  timezone: z.string().min(1),
  plan: z.enum(["starter", "pro", "business", "enterprise", "whitelabel"]),
  status: z.enum(["active", "paused", "cancelled"]),
});

export async function updateTenantAdminAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const parsed = updateTenantSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  await requireBolivAIAdmin();
  const svc = createServiceClient();

  const { error } = await svc
    .from("tenants")
    .update({
      name: parsed.data.name,
      industry: parsed.data.industry || null,
      language: parsed.data.language,
      timezone: parsed.data.timezone,
      plan: parsed.data.plan,
      status: parsed.data.status,
    })
    .eq("id", parsed.data.id);

  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  revalidatePath("/admin", "layout");
  return { error: null, success: true };
}

// ─── Delete a tenant (cascades to all children) ──────────────────────
const deleteSchema = z.object({
  id: z.string().uuid(),
  confirm_slug: z.string(),
});

export async function deleteTenantAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const parsed = deleteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Datos inválidos" };

  await requireBolivAIAdmin();
  const svc = createServiceClient();

  // Verify the typed slug matches before nuking
  const { data: tenant } = await svc
    .from("tenants")
    .select("slug")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (!tenant) return { error: "Tenant no encontrado" };
  if ((tenant as { slug: string }).slug !== parsed.data.confirm_slug) {
    return { error: "El slug de confirmación no coincide" };
  }

  const { error } = await svc.from("tenants").delete().eq("id", parsed.data.id);
  if (error) return { error: error.message };

  revalidatePath("/admin", "layout");
  redirect("/admin");
}

// ─── Promote / demote BolivAI staff ──────────────────────────────────
const promoteSchema = z.object({
  email: z.string().email("Email inválido"),
  role: z.enum(["admin", "superadmin"]),
});

export async function promoteAdminAction(
  _prev: AdminState,
  formData: FormData,
): Promise<AdminState> {
  const parsed = promoteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  await requireBolivAIAdmin();
  const svc = createServiceClient();

  // Find the auth.users id by email (admin API)
  const { data: list } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const target = list?.users?.find(
    (u) => u.email?.toLowerCase() === parsed.data.email.toLowerCase(),
  );
  if (!target) {
    return {
      error: "Esa persona aún no tiene cuenta — pídele que se registre primero",
    };
  }

  const { error } = await svc.from("bolivai_admins").upsert(
    { user_id: target.id, role: parsed.data.role },
    { onConflict: "user_id" },
  );
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { error: null, success: true };
}

export async function demoteAdminAction(userId: string): Promise<AdminState> {
  const me = await requireUser();
  await requireBolivAIAdmin();

  if (me.id === userId) {
    return { error: "No puedes quitarte a ti mismo" };
  }

  const svc = createServiceClient();
  const { error } = await svc.from("bolivai_admins").delete().eq("user_id", userId);
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { error: null, success: true };
}

export type StaffRow = {
  user_id: string;
  email: string;
  role: string;
  created_at: string;
};

export async function loadBolivAIStaff(): Promise<StaffRow[]> {
  await requireBolivAIAdmin();
  const svc = createServiceClient();

  const { data } = await svc
    .from("bolivai_admins")
    .select("user_id, role, created_at")
    .order("created_at", { ascending: true });

  const staff: StaffRow[] = [];
  for (const row of (data ?? []) as Array<{
    user_id: string;
    role: string;
    created_at: string;
  }>) {
    const { data: u } = await svc.auth.admin.getUserById(row.user_id);
    staff.push({
      user_id: row.user_id,
      role: row.role,
      created_at: row.created_at,
      email: u?.user?.email ?? "—",
    });
  }
  return staff;
}
