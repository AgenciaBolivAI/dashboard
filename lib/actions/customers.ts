"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";

export type CustomerActionState = {
  error: string | null;
  success?: boolean;
};

const profileSchema = z.object({
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
  is_vip: z.string().optional().transform((v) => v === "on" || v === "true"),
  tenant_notes: z.string().max(4000).optional().transform((v) => v || null),
});

export async function updateCustomerProfileAction(
  _prev: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const { tenant_id, user_id, is_vip, tenant_notes } = parsed.data;

  await requireUser();
  await requireTenantAccess(tenant_id, { minRole: "operator" });

  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({ is_vip, tenant_notes })
    .eq("id", user_id)
    .eq("tenant_id", tenant_id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}
