"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";

export type TaskActionResult = { ok: boolean; error?: string; id?: string };

const createSchema = z.object({
  title: z.string().trim().min(1).max(300),
  notes: z.string().trim().max(4000).optional().nullable(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  due_at: z.string().datetime().optional().nullable(),
  assignee_user_id: z.string().uuid().optional().nullable(),
  related_type: z
    .enum(["lead", "deal", "conversation", "ticket", "customer", "reservation", "none"])
    .optional()
    .nullable(),
  related_id: z.string().uuid().optional().nullable(),
});

export async function createTaskAction(
  tenantId: string,
  input: z.infer<typeof createSchema>,
): Promise<TaskActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    const et = await getTranslations("action_errors");
    return { ok: false, error: et("invalid_data") };
  }

  const user = await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("tasks")
    .insert({
      tenant_id: tenantId,
      title: parsed.data.title,
      notes: parsed.data.notes?.trim() || null,
      priority: parsed.data.priority ?? "medium",
      due_at: parsed.data.due_at ?? null,
      assignee_user_id: parsed.data.assignee_user_id ?? null,
      created_by: user.id,
      related_type: parsed.data.related_type ?? null,
      related_id: parsed.data.related_id ?? null,
    } as never)
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true, id: (data as { id: string }).id };
}

const updateSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  notes: z.string().trim().max(4000).optional().nullable(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  due_at: z.string().datetime().optional().nullable(),
  assignee_user_id: z.string().uuid().optional().nullable(),
});

export async function updateTaskAction(
  tenantId: string,
  taskId: string,
  patch: z.infer<typeof updateSchema>,
): Promise<TaskActionResult> {
  const parsed = updateSchema.safeParse(patch);
  if (!parsed.success) {
    const et = await getTranslations("action_errors");
    return { ok: false, error: et("invalid_data") };
  }

  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const fields: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v !== undefined) fields[k] = k === "notes" && typeof v === "string" ? v.trim() || null : v;
  }
  if (Object.keys(fields).length === 0) return { ok: true };

  const svc = createServiceClient();
  const { error } = await svc.from("tasks").update(fields as never).eq("id", taskId).eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true, id: taskId };
}

/** Toggle a task open/done, stamping completed_at. */
export async function setTaskDoneAction(
  tenantId: string,
  taskId: string,
  done: boolean,
): Promise<TaskActionResult> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const svc = createServiceClient();
  const { error } = await svc
    .from("tasks")
    .update({
      status: done ? "done" : "open",
      completed_at: done ? new Date().toISOString() : null,
    } as never)
    .eq("id", taskId)
    .eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true, id: taskId };
}

export async function deleteTaskAction(tenantId: string, taskId: string): Promise<TaskActionResult> {
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const svc = createServiceClient();
  const { error } = await svc.from("tasks").delete().eq("id", taskId).eq("tenant_id", tenantId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}
