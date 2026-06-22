"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";

export type StaffState = { error: string | null; success?: boolean };

function extractServiceIds(formData: FormData): string[] {
  return formData
    .getAll("service_ids")
    .map((v) => String(v))
    .filter((v) => /^[0-9a-f-]{36}$/i.test(v));
}

const baseSchema = z.object({
  tenant_id: z.string().uuid(),
  name: z.string().trim().min(1, "Nombre requerido").max(120),
  email: z.string().email().optional().or(z.literal("")),
  role: z.string().optional(),
  active: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

async function syncStaffServices(
  tenantId: string,
  staffId: string,
  serviceIds: string[],
) {
  const supabase = await createClient();
  await supabase
    .from("staff_services")
    .delete()
    .eq("staff_id", staffId)
    .eq("tenant_id", tenantId);

  if (serviceIds.length === 0) return;

  await supabase.from("staff_services").insert(
    serviceIds.map((service_id) => ({
      tenant_id: tenantId,
      staff_id: staffId,
      service_id,
    })),
  );
}

export async function createStaffAction(
  _prev: StaffState,
  formData: FormData,
): Promise<StaffState> {
  const et = await getTranslations("action_errors");
  const parsed = baseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? et("invalid_data") };
  }
  const serviceIds = extractServiceIds(formData);

  await requireUser();
  await requireTenantAccess(parsed.data.tenant_id, { minRole: "admin" });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff")
    .insert({
      tenant_id: parsed.data.tenant_id,
      name: parsed.data.name,
      email: parsed.data.email || null,
      role: parsed.data.role || null,
      active: parsed.data.active ?? true,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const staffId = (data as { id: string }).id;
  await syncStaffServices(parsed.data.tenant_id, staffId, serviceIds);

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

const updateSchema = baseSchema.extend({ id: z.string().uuid() });

export async function updateStaffAction(
  _prev: StaffState,
  formData: FormData,
): Promise<StaffState> {
  const et = await getTranslations("action_errors");
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? et("invalid_data") };
  }
  const serviceIds = extractServiceIds(formData);

  await requireUser();
  await requireTenantAccess(parsed.data.tenant_id, { minRole: "admin" });

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff")
    .update({
      name: parsed.data.name,
      email: parsed.data.email || null,
      role: parsed.data.role || null,
      active: parsed.data.active ?? true,
    })
    .eq("id", parsed.data.id)
    .eq("tenant_id", parsed.data.tenant_id);

  if (error) return { error: error.message };

  await syncStaffServices(parsed.data.tenant_id, parsed.data.id, serviceIds);

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

export async function deleteStaffAction(
  tenantId: string,
  staffId: string,
): Promise<StaffState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff")
    .delete()
    .eq("id", staffId)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}
