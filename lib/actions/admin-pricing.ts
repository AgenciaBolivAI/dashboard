"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser, requireBolivAIAdmin } from "@/lib/auth";

export type AdminPricingState = { error: string | null; success?: boolean };

const updateSchema = z.object({
  action_key: z.string().trim().min(2).max(80),
  credits_per_unit: z.coerce.number().int().min(0).max(1_000_000),
  cost_per_unit_micros: z.coerce.number().int().min(0).max(1_000_000_000),
  description: z.string().trim().max(500).optional(),
  vendor_cost_micros_json: z.string().trim().max(2000).optional(),
});

/**
 * Update one credit_pricing row. Admin-gated. Vendor breakdown is passed
 * as a JSON string from the form; we parse + validate it's an object of
 * vendor → number micros. We do NOT enforce that vendor sums == cost
 * because temporary mismatches during tuning are fine; the audit view
 * surfaces them as a warning.
 */
export async function updateCreditPricingAction(
  _prev: AdminPricingState,
  formData: FormData,
): Promise<AdminPricingState> {
  await requireUser();
  await requireBolivAIAdmin();

  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const { action_key, credits_per_unit, cost_per_unit_micros, description, vendor_cost_micros_json } =
    parsed.data;

  let vendor_cost_micros: Record<string, number> | undefined;
  if (vendor_cost_micros_json) {
    try {
      const obj = JSON.parse(vendor_cost_micros_json);
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
        return { error: "vendor_cost_micros debe ser un objeto JSON" };
      }
      vendor_cost_micros = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        const n = typeof v === "number" ? v : Number(v);
        if (!Number.isFinite(n) || n < 0) {
          return { error: `Valor inválido para vendor '${k}': debe ser un entero ≥ 0` };
        }
        vendor_cost_micros[k] = Math.round(n);
      }
    } catch {
      return { error: "JSON inválido en vendor_cost_micros" };
    }
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("credit_pricing")
    .update({
      credits_per_unit,
      cost_per_unit_micros,
      ...(description !== undefined && { description }),
      ...(vendor_cost_micros !== undefined && {
        vendor_cost_micros: vendor_cost_micros as Record<string, never>,
      }),
      updated_at: new Date().toISOString(),
    })
    .eq("action_key", action_key);

  if (error) return { error: error.message };

  revalidatePath("/admin/pricing");
  revalidatePath("/admin/overview");
  revalidatePath("/admin/usage");
  return { error: null, success: true };
}
