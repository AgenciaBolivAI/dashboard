/**
 * GET /api/v1/reservations — list bookings, newest first (Zapier "New
 * Reservation" trigger). ?since=ISO &?limit=
 */
import { apiAuth, isErr, v1svc, listParams, ok, bad } from "@/lib/api/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLS =
  "id, customer_name, customer_phone, customer_email, service_id, start_at, end_at, status, notes, meeting_url, created_at";

export async function GET(req: Request) {
  const a = await apiAuth(req);
  if (isErr(a)) return a;
  const { since, limit } = listParams(req);
  let q = v1svc()
    .from("reservations")
    .select(COLS)
    .eq("tenant_id", a.tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (since) q = q.gt("created_at", since);
  const { data, error } = await q;
  if (error) return bad(error.message, 500);
  return ok(data ?? []);
}
