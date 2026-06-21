import { createClient } from "@/lib/supabase/server";

export type TaskStatus = "open" | "done";
export type TaskPriority = "low" | "medium" | "high";
export type TaskRelatedType =
  | "lead"
  | "deal"
  | "conversation"
  | "ticket"
  | "customer"
  | "reservation"
  | "none";

export type Task = {
  id: string;
  tenant_id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  assignee_user_id: string | null;
  created_by: string | null;
  related_type: TaskRelatedType | null;
  related_id: string | null;
  created_at: string;
  completed_at: string | null;
};

const TASK_COLS =
  "id, tenant_id, title, notes, status, priority, due_at, assignee_user_id, created_by, related_type, related_id, created_at, completed_at";

export type TaskFilters = {
  status?: TaskStatus;
  assigneeUserId?: string;
  relatedType?: TaskRelatedType;
  relatedId?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

/** Paginated task listing + total count for the filters (RLS scopes by tenant). */
export async function listTasks(
  tenantId: string,
  opts: TaskFilters = {},
): Promise<{ rows: Task[]; total: number }> {
  const supabase = await createClient();
  // Open tasks first (by soonest due), then done; newest as tiebreak.
  let q = supabase
    .from("tasks")
    .select(TASK_COLS, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("status", { ascending: true })
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (opts.status) q = q.eq("status", opts.status);
  if (opts.assigneeUserId) q = q.eq("assignee_user_id", opts.assigneeUserId);
  if (opts.relatedType) q = q.eq("related_type", opts.relatedType);
  if (opts.relatedId) q = q.eq("related_id", opts.relatedId);
  if (opts.search) {
    const s = opts.search.replace(/[,()*]/g, " ").trim();
    if (s) q = q.or(`title.ilike.*${s}*,notes.ilike.*${s}*`);
  }

  if (opts.offset != null) {
    q = q.range(opts.offset, opts.offset + (opts.limit ?? 50) - 1);
  } else {
    q = q.limit(opts.limit ?? 100);
  }

  const { data, count } = await q;
  return { rows: (data ?? []) as Task[], total: count ?? 0 };
}

/** A user's open tasks (assigned to them), soonest-due first — for the home widget. */
export async function getMyOpenTasks(
  tenantId: string,
  userId: string,
  limit = 6,
): Promise<Task[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select(TASK_COLS)
    .eq("tenant_id", tenantId)
    .eq("assignee_user_id", userId)
    .eq("status", "open")
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(limit);
  return (data ?? []) as Task[];
}

/** Count of a user's open tasks (for badges / summaries). */
export async function countMyOpenTasks(tenantId: string, userId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("assignee_user_id", userId)
    .eq("status", "open");
  return count ?? 0;
}
