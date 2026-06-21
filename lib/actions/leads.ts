"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { LEAD_STATUSES } from "@/lib/leads-types";

export type LeadState = { error: string | null; success?: boolean };

/** Fields a CSV import can map onto a lead. Scalars + a few metadata facets. */
export const IMPORTABLE_LEAD_FIELDS = [
  "name",
  "whatsapp_number",
  "email",
  "intent",
  "notes",
  "status",
  "source",
  "vertical",
  "city",
  "website",
  "address",
] as const;
export type ImportableLeadField = (typeof IMPORTABLE_LEAD_FIELDS)[number];

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
    return { error: "Estado inválido" };
  }

  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const supabase = await createClient();
  const { error } = await supabase
    .from("leads")
    .update({ status: parsedStatus.data })
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
