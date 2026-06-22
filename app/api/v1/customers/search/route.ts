/**
 * GET /api/v1/customers/search?phone=…  or  ?email=…  or  ?q=…
 * Zapier "Find Customer" search. Returns an array (possibly empty).
 */
import { apiAuth, isErr, v1svc, ok, bad } from "@/lib/api/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLS = "id, name, whatsapp_number, email, business_name, point_of_contact, is_vip, created_at";

export async function GET(req: Request) {
  const a = await apiAuth(req);
  if (isErr(a)) return a;
  const url = new URL(req.url);
  const phone = url.searchParams.get("phone")?.trim();
  const email = url.searchParams.get("email")?.trim();
  const q = url.searchParams.get("q")?.trim();
  if (!phone && !email && !q) return bad("Provide phone, email, or q.");

  let query = v1svc().from("users").select(COLS).eq("tenant_id", a.tenantId).limit(10);
  if (phone) query = query.eq("whatsapp_number", phone);
  else if (email) query = query.eq("email", email);
  else if (q) {
    // Strip PostgREST filter-structural chars before interpolating into .or()
    // — `,`/`(`/`)`/`"`/`\` would break the expression (or inject conditions).
    const safe = q.replace(/[,()"\\]/g, " ").trim();
    if (!safe) return ok([]);
    query = query.or(`name.ilike.%${safe}%,email.ilike.%${safe}%,whatsapp_number.ilike.%${safe}%`);
  }

  const { data, error } = await query;
  if (error) return bad(error.message, 500);
  return ok(data ?? []);
}
