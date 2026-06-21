"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";

export type TicketActionResult = { ok: boolean; error?: string };

/** Promote a conversation to a tracked ticket (idempotent-ish: sets defaults). */
export async function convertToTicketAction(
  tenantId: string,
  conversationId: string,
): Promise<TicketActionResult> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const svc = createServiceClient();
  // Only set status/priority defaults if not already a ticket (don't clobber).
  const { data: existing } = await svc
    .from("conversations")
    .select("is_ticket")
    .eq("id", conversationId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const already = (existing as { is_ticket?: boolean } | null)?.is_ticket;

  const patch = already
    ? { is_ticket: true }
    : { is_ticket: true, ticket_status: "open", priority: "medium" };

  const { error } = await svc
    .from("conversations")
    .update(patch as never)
    .eq("id", conversationId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

const updateSchema = z.object({
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assignee_user_id: z.string().uuid().nullable().optional(),
  ticket_status: z.enum(["open", "in_progress", "waiting", "resolved", "closed"]).optional(),
  sla_due_at: z.string().datetime().nullable().optional(),
  resolution_notes: z.string().trim().max(4000).nullable().optional(),
});

export async function updateTicketAction(
  tenantId: string,
  conversationId: string,
  patch: z.infer<typeof updateSchema>,
): Promise<TicketActionResult> {
  const parsed = updateSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, error: "Cambios inválidos" };

  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) fields[k] = v;
  }
  // Stamp / clear resolved_at to match the status transition.
  if (parsed.data.ticket_status === "resolved") fields.resolved_at = new Date().toISOString();
  else if (parsed.data.ticket_status && parsed.data.ticket_status !== "closed") fields.resolved_at = null;
  if (Object.keys(fields).length === 0) return { ok: true };

  const svc = createServiceClient();
  const { error } = await svc
    .from("conversations")
    .update(fields as never)
    .eq("id", conversationId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
