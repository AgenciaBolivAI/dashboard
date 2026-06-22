"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { type ImportableCustomerField } from "@/lib/customers-types";

export type ImportCustomersResult =
  | { ok: true; inserted: number; skipped: number }
  | { ok: false; error: string };

/**
 * Bulk-import customers from a mapped CSV (the field-mapping flow). tenant_id is
 * injected server-side; rows with no name/phone/email are skipped. Caps at
 * 5000 rows. operator+ only. Mirrors importLeadsAction.
 */
export async function importCustomersAction(
  tenantId: string,
  rows: Array<Partial<Record<ImportableCustomerField, string>>>,
): Promise<ImportCustomersResult> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "No rows to import." };
  }

  const capped = rows.slice(0, 5000);
  let skipped = 0;
  const records: Record<string, unknown>[] = [];

  for (const r of capped) {
    const name = (r.name ?? "").trim();
    const phoneRaw = (r.whatsapp_number ?? "").trim();
    const email = (r.email ?? "").trim();
    if (!name && !phoneRaw && !email) {
      skipped++;
      continue;
    }
    records.push({
      tenant_id: tenantId,
      name: name || null,
      whatsapp_number: phoneRaw ? phoneRaw.replace(/[^\d+]/g, "") || null : null,
      email: email || null,
      business_name: (r.business_name ?? "").trim() || null,
      point_of_contact: (r.point_of_contact ?? "").trim() || null,
      tenant_notes: (r.notes ?? "").trim() || null,
    });
  }

  if (records.length === 0) {
    return { ok: false, error: "No valid rows (every row was missing name, phone and email)." };
  }

  const svc = createServiceClient();
  let inserted = 0;
  for (let i = 0; i < records.length; i += 500) {
    const chunk = records.slice(i, i + 500);
    const { error } = await svc.from("users").insert(chunk as never);
    if (error) return { ok: false, error: error.message };
    inserted += chunk.length;
  }

  revalidatePath("/dashboard", "layout");
  return { ok: true, inserted, skipped };
}

export type CustomerActionState = {
  error: string | null;
  success?: boolean;
};

/**
 * Customer profile update — covers basic info (name, phone, email,
 * business_name, point_of_contact) PLUS VIP flag and internal notes.
 *
 * All fields are optional in the payload (any subset can be sent). Empty
 * strings normalize to null so we don't store `""` for missing data.
 *
 * The form uses FormData (Server Action) so the schema preprocesses
 * checkbox values + trims strings.
 */
const profileSchema = z.object({
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),

  // Basic info
  name: z.string().trim().max(160).optional().transform((v) => v || null),
  whatsapp_number: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => {
      if (!v) return null;
      // Normalize: strip everything except digits + leading '+', keep leading '+'
      const had_plus = v.startsWith("+");
      const digits = v.replace(/\D/g, "");
      if (!digits) return null;
      return had_plus ? digits : digits; // store digits-only (DB convention)
    })
    .refine(
      (v) => v === null || /^[1-9]\d{6,14}$/.test(v),
      "Phone must be 7–15 digits in E.164 format (no leading 0)",
    ),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v.toLowerCase() : null))
    .refine(
      (v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      "Invalid email",
    ),
  business_name: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((v) => v || null),
  point_of_contact: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((v) => v || null),

  // Flags + notes
  is_vip: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
  tenant_notes: z
    .string()
    .max(4000)
    .optional()
    .transform((v) => v || null),
});

export async function updateCustomerProfileAction(
  _prev: CustomerActionState,
  formData: FormData,
): Promise<CustomerActionState> {
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const et = await getTranslations("action_errors");
    return { error: parsed.error.issues[0]?.message ?? et("invalid_data") };
  }
  const {
    tenant_id,
    user_id,
    name,
    whatsapp_number,
    email,
    business_name,
    point_of_contact,
    is_vip,
    tenant_notes,
  } = parsed.data;

  await requireUser();
  await requireTenantAccess(tenant_id, { minRole: "operator" });

  const supabase = await createClient();
  // The generated DB types may not include business_name + point_of_contact
  // yet (run npm run db:types after schema-step24 to refresh). Use the
  // `as never` cast to avoid a stale-types compile error.
  const { error } = await supabase
    .from("users")
    .update({
      name,
      whatsapp_number,
      email,
      business_name,
      point_of_contact,
      is_vip,
      tenant_notes,
    } as never)
    .eq("id", user_id)
    .eq("tenant_id", tenant_id);

  if (error) return { error: error.message };
  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}
