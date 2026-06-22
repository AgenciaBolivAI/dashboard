/**
 * GET /api/v1/conversations — recent conversations, newest activity first
 * (Zapier "New Conversation" trigger). ?since=ISO &?limit= &?needs_human=1
 * (only conversations a human has taken over).
 */
import { apiAuth, isErr, v1svc, listParams, ok, bad } from "@/lib/api/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLS =
  "id, channel, status, hitl_taken_over, is_ticket, ticket_status, priority, last_message_at, created_at";

export async function GET(req: Request) {
  const a = await apiAuth(req);
  if (isErr(a)) return a;
  const { since, limit } = listParams(req);
  const needsHuman = new URL(req.url).searchParams.get("needs_human") === "1";
  let q = v1svc()
    .from("conversations")
    .select(COLS)
    .eq("tenant_id", a.tenantId)
    .order("last_message_at", { ascending: false })
    .limit(limit);
  if (needsHuman) q = q.eq("hitl_taken_over", true);
  if (since) q = q.gt("last_message_at", since);
  const { data, error } = await q;
  if (error) return bad(error.message, 500);
  return ok(data ?? []);
}
