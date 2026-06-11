"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser, requireTenantAccess } from "@/lib/auth";

export type SandraQueueState = { error: string | null; success?: boolean; count?: number };

const STATUS_VALUES = [
  "pending",
  "calling",
  "completed",
  "skipped",
  "no_answer",
  "failed",
] as const;

/**
 * Bulk-add leads to Sandra's outbound call queue. Skips leads that are
 * already in the queue with a non-terminal status (pending/calling) so a
 * misclick on "Add to queue" doesn't multiply rows.
 */
export async function addLeadsToSandraQueueAction(
  tenantId: string,
  leadIds: string[],
  priority: number = 100,
): Promise<SandraQueueState> {
  const idsSchema = z.array(z.string().uuid()).min(1).max(500);
  const parsed = idsSchema.safeParse(leadIds);
  if (!parsed.success) return { error: "IDs inválidos" };

  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const svc = createServiceClient();

  // Step A — pull the candidate leads' status so we can hard-block any
  // marked as do_not_contact. DNC is non-negotiable: even an explicit user
  // action shouldn't queue them; they have to be reactivated by changing
  // status away from DNC first.
  const { data: leadRows, error: leadErr } = await svc
    .from("leads")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .in("id", parsed.data);
  if (leadErr) return { error: leadErr.message };
  const dncSet = new Set(
    ((leadRows ?? []) as { id: string; status: string | null }[])
      .filter((r) => r.status === "do_not_contact")
      .map((r) => r.id),
  );

  // Step B — find which are already actively queued so we don't double-add.
  const { data: existing, error: existingErr } = await svc
    .from("sandra_call_queue")
    .select("lead_id")
    .eq("tenant_id", tenantId)
    .in("lead_id", parsed.data)
    .in("status", ["pending", "calling"]);
  if (existingErr) return { error: existingErr.message };
  const skip = new Set(
    ((existing ?? []) as { lead_id: string | null }[])
      .map((r) => r.lead_id)
      .filter((id): id is string => !!id),
  );
  const toInsert = parsed.data
    .filter((id) => !skip.has(id) && !dncSet.has(id))
    .map((leadId) => ({
      tenant_id: tenantId,
      lead_id: leadId,
      priority,
      status: "pending" as const,
    }));
  const blockedDnc = parsed.data.filter((id) => dncSet.has(id)).length;

  if (toInsert.length === 0) {
    return {
      error: blockedDnc > 0
        ? `${blockedDnc} lead${blockedDnc > 1 ? "s" : ""} bloqueado${blockedDnc > 1 ? "s" : ""} (marcado${blockedDnc > 1 ? "s" : ""} como "no contactar")`
        : null,
      success: true,
      count: 0,
    };
  }

  const { error } = await svc.from("sandra_call_queue").insert(toInsert);
  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return {
    error: blockedDnc > 0
      ? `${blockedDnc} lead${blockedDnc > 1 ? "s" : ""} bloqueado${blockedDnc > 1 ? "s" : ""} por DNC`
      : null,
    success: true,
    count: toInsert.length,
  };
}

const statusSchema = z.enum(STATUS_VALUES);

export async function updateSandraQueueItemAction(
  tenantId: string,
  queueId: string,
  fields: { status?: string; outcome?: string | null; notes?: string | null },
): Promise<SandraQueueState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  let statusValue: typeof STATUS_VALUES[number] | undefined;
  if (fields.status !== undefined) {
    const parsed = statusSchema.safeParse(fields.status);
    if (!parsed.success) return { error: "Estado inválido" };
    statusValue = parsed.data;
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("sandra_call_queue")
    .update({
      ...(statusValue !== undefined && { status: statusValue }),
      ...(fields.outcome !== undefined && { outcome: fields.outcome }),
      ...(fields.notes !== undefined && { notes: fields.notes }),
    })
    .eq("id", queueId)
    .eq("tenant_id", tenantId);
  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}

export async function removeFromSandraQueueAction(
  tenantId: string,
  queueId: string,
): Promise<SandraQueueState> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const svc = createServiceClient();
  const { error } = await svc
    .from("sandra_call_queue")
    .delete()
    .eq("id", queueId)
    .eq("tenant_id", tenantId);
  if (error) return { error: error.message };

  revalidatePath("/dashboard", "layout");
  return { error: null, success: true };
}
