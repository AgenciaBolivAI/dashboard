/**
 * /api/v1/tasks
 *   GET  — list tasks, newest first.
 *   POST — create a task (Zapier "Create Task" action).
 */
import { apiAuth, isErr, v1svc, listParams, jsonBody, str, ok, bad } from "@/lib/api/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLS = "id, title, notes, status, priority, due_at, created_at, completed_at";
const PRIORITIES = new Set(["low", "medium", "high"]);

export async function GET(req: Request) {
  const a = await apiAuth(req);
  if (isErr(a)) return a;
  const { since, limit } = listParams(req);
  let q = v1svc()
    .from("tasks")
    .select(COLS)
    .eq("tenant_id", a.tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (since) q = q.gt("created_at", since);
  const { data, error } = await q;
  if (error) return bad(error.message, 500);
  return ok(data ?? []);
}

export async function POST(req: Request) {
  const a = await apiAuth(req, { write: true });
  if (isErr(a)) return a;
  const body = await jsonBody(req);
  const title = str(body, "title");
  if (!title) return bad("title is required.");
  const priorityRaw = str(body, "priority");
  const priority = priorityRaw && PRIORITIES.has(priorityRaw) ? priorityRaw : "medium";

  const row = {
    tenant_id: a.tenantId,
    title: title.slice(0, 300),
    notes: str(body, "notes") ?? null,
    priority,
    due_at: str(body, "due_at") ?? null,
    status: "open",
  };
  const { data, error } = await v1svc().from("tasks").insert(row).select(COLS).single();
  if (error) return bad(error.message, 500);
  return ok(data, 201);
}
