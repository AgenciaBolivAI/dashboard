"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { LEAD_STATUSES } from "@/lib/leads-types";

export type LeadState = { error: string | null; success?: boolean };

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
