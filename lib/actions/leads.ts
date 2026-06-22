"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { LEAD_STATUSES, type ImportableLeadField } from "@/lib/leads-types";

export type LeadState = { error: string | null; success?: boolean };

export type ImportLeadsResult =
  | { ok: true; inserted: number; skipped: number }
  | { ok: false; error: string };

/**
 * Bulk-import leads from a mapped CSV (the field-mapping flow). Each row is a
 * partial map of importable field → string value; tenant_id is injected
 * server-side. Rows with no name/phone/email are skipped. Caps at 5000 rows.
 * operator+ only (same gate as the other lead writes).
 */
export async function importLeadsAction(
  tenantId: string,
  rows: Array<Partial<Record<ImportableLeadField, string>>>,
): Promise<ImportLeadsResult> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "No rows to import." };
  }

  const capped = rows.slice(0, 5000);
  let skipped = 0;
  const records: Record<string, unknown>[] = [];
  const validStatuses = LEAD_STATUSES as readonly string[];

  for (const r of capped) {
    const name = (r.name ?? "").trim();
    const phoneRaw = (r.whatsapp_number ?? "").trim();
    const email = (r.email ?? "").trim();
    if (!name && !phoneRaw && !email) {
      skipped++;
      continue;
    }
    const statusIn = (r.status ?? "").trim();
    const status = validStatuses.includes(statusIn) ? statusIn : "new";
    const metadata: Record<string, string> = {};
    for (const k of ["vertical", "city", "website", "address"] as const) {
      const v = (r[k] ?? "").trim();
      if (v) metadata[k] = v;
    }
    records.push({
      tenant_id: tenantId,
      name: name || null,
      whatsapp_number: phoneRaw ? phoneRaw.replace(/[^\d+]/g, "") || null : null,
      email: email || null,
      intent: (r.intent ?? "").trim() || null,
      notes: (r.notes ?? "").trim() || null,
      status,
      source: (r.source ?? "").trim() || "import",
      metadata,
    });
  }

  if (records.length === 0) {
    return { ok: false, error: "No valid rows (every row was missing name, phone and email)." };
  }

  const svc = createServiceClient();
  let inserted = 0;
  for (let i = 0; i < records.length; i += 500) {
    const chunk = records.slice(i, i + 500);
    const { error } = await svc.from("leads").insert(chunk as never);
    if (error) return { ok: false, error: error.message };
    inserted += chunk.length;
  }

  revalidatePath("/dashboard", "layout");
  return { ok: true, inserted, skipped };
}

const statusSchema = z.enum(LEAD_STATUSES);

export async function updateLeadStatusAction(
  tenantId: string,
  leadId: string,
  status: string,
): Promise<LeadState> {
  const parsedStatus = statusSchema.safeParse(status);
  if (!parsedStatus.success) {
    const et = await getTranslations("action_errors");
    return { error: et("lead_invalid_status") };
  }

  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const supabase = await createClient();
  // Stamp won_at when the deal is won (converted); clear it if it moves back out.
  const patch: { status: string; won_at?: string | null } = { status: parsedStatus.data };
  if (parsedStatus.data === "converted") patch.won_at = new Date().toISOString();
  else patch.won_at = null;
  const { error } = await supabase
    .from("leads")
    .update(patch)
    .eq("id", leadId)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

export async function deleteLeadAction(
  tenantId: string,
  leadId: string,
): Promise<LeadState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "admin" });

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .delete()
    .eq("id", leadId)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

export async function updateLeadNotesAction(
  tenantId: string,
  leadId: string,
  notes: string,
): Promise<LeadState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ notes: notes.trim() || null })
    .eq("id", leadId)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

const dealSchema = z.object({
  value_cents: z.number().int().min(0).max(1_000_000_000_000).nullable().optional(),
  currency: z.string().trim().min(3).max(3).nullable().optional(),
  expected_close_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

/**
 * Set a lead's DEAL fields (pipeline value / currency / expected close).
 * value_cents is the smallest currency unit (e.g. cents). operator+ only.
 */
export async function updateLeadDealAction(
  tenantId: string,
  leadId: string,
  deal: z.infer<typeof dealSchema>,
): Promise<LeadState> {
  const parsed = dealSchema.safeParse(deal);
  if (!parsed.success) {
    const et = await getTranslations("action_errors");
    return { error: et("invalid_data") };
  }

  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const patch: Record<string, unknown> = {};
  if ("value_cents" in parsed.data) patch.value_cents = parsed.data.value_cents ?? null;
  if ("currency" in parsed.data) patch.currency = parsed.data.currency?.toUpperCase() ?? null;
  if ("expected_close_at" in parsed.data) patch.expected_close_at = parsed.data.expected_close_at ?? null;
  if (Object.keys(patch).length === 0) return { error: null, success: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update(patch as never)
    .eq("id", leadId)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}
