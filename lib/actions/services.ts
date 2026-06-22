"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";

export type ServiceState = { error: string | null; success?: boolean; serviceId?: string };

// staff_ids arrives from the form as repeated form fields. We collect them
// outside the zod base schema (Object.fromEntries collapses repeats).
function extractStaffIds(formData: FormData): string[] {
  return formData
    .getAll("staff_ids")
    .map((v) => String(v))
    .filter((v) => /^[0-9a-f-]{36}$/i.test(v));
}

const baseSchema = z.object({
  tenant_id: z.string().uuid(),
  name: z.string().trim().min(1, "Nombre requerido").max(120),
  description: z.string().optional(),
  price_amount: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : Number(v)))
    .refine((v) => v === null || (!Number.isNaN(v) && v >= 0), "Precio inválido"),
  price_currency: z.string().min(2).max(8).default("BOB"),
  duration_min: z
    .string()
    .transform((v) => Number(v))
    .refine((v) => Number.isFinite(v) && v > 0 && v <= 600, "Duración inválida"),
  category: z.string().optional(),
  active: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
});

async function syncServiceStaff(
  tenantId: string,
  serviceId: string,
  staffIds: string[],
) {
  const supabase = await createClient();
  // wipe + re-insert is simpler than diff and the rows are tiny
  await supabase
    .from("staff_services")
    .delete()
    .eq("service_id", serviceId)
    .eq("tenant_id", tenantId);

  if (staffIds.length === 0) return;

  await supabase.from("staff_services").insert(
    staffIds.map((staff_id) => ({
      tenant_id: tenantId,
      service_id: serviceId,
      staff_id,
    })),
  );
}

export async function createServiceAction(
  _prev: ServiceState,
  formData: FormData,
): Promise<ServiceState> {
  const et = await getTranslations("action_errors");
  const parsed = baseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? et("invalid_data") };
  }
  const staffIds = extractStaffIds(formData);

  await requireUser();
  await requireTenantAccess(parsed.data.tenant_id, { minRole: "operator" });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("services")
    .insert({
      tenant_id: parsed.data.tenant_id,
      name: parsed.data.name,
      description: parsed.data.description || null,
      price_amount: parsed.data.price_amount,
      price_currency: parsed.data.price_currency,
      duration_min: parsed.data.duration_min,
      category: parsed.data.category || null,
      active: parsed.data.active ?? true,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  const serviceId = (data as { id: string }).id;
  await syncServiceStaff(parsed.data.tenant_id, serviceId, staffIds);

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true, serviceId };
}

const updateSchema = baseSchema.extend({ id: z.string().uuid() });

export async function updateServiceAction(
  _prev: ServiceState,
  formData: FormData,
): Promise<ServiceState> {
  const et = await getTranslations("action_errors");
  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? et("invalid_data") };
  }
  const staffIds = extractStaffIds(formData);

  await requireUser();
  await requireTenantAccess(parsed.data.tenant_id, { minRole: "operator" });

  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .update({
      name: parsed.data.name,
      description: parsed.data.description || null,
      price_amount: parsed.data.price_amount,
      price_currency: parsed.data.price_currency,
      duration_min: parsed.data.duration_min,
      category: parsed.data.category || null,
      active: parsed.data.active ?? true,
    })
    .eq("id", parsed.data.id)
    .eq("tenant_id", parsed.data.tenant_id);

  if (error) return { error: error.message };

  await syncServiceStaff(parsed.data.tenant_id, parsed.data.id, staffIds);

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

export async function deleteServiceAction(
  tenantId: string,
  serviceId: string,
): Promise<ServiceState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .delete()
    .eq("id", serviceId)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

export async function toggleServiceActiveAction(
  tenantId: string,
  serviceId: string,
  active: boolean,
): Promise<ServiceState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .update({ active })
    .eq("id", serviceId)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}
