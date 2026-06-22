/**
 * /api/v1/customers  (customers are `users` rows — the agent's contacts)
 *   GET  — list customers, newest first (Zapier "New Customer" trigger).
 *   POST — create-or-update a customer (matched by phone or email within the
 *          tenant), Zapier "Create/Update Customer" action.
 */
import { apiAuth, isErr, v1svc, listParams, jsonBody, str, ok, bad } from "@/lib/api/v1";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLS = "id, name, whatsapp_number, email, business_name, point_of_contact, is_vip, created_at";

export async function GET(req: Request) {
  const a = await apiAuth(req);
  if (isErr(a)) return a;
  const { since, limit } = listParams(req);
  let q = v1svc()
    .from("users")
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

  const phone = str(body, "whatsapp_number", "phone");
  const email = str(body, "email");
  const name = str(body, "name");
  if (!phone && !email && !name) return bad("Provide at least one of: name, phone (whatsapp_number), email.");

  const fields: Record<string, unknown> = {};
  if (name !== undefined) fields.name = name;
  if (phone !== undefined) fields.whatsapp_number = phone;
  if (email !== undefined) fields.email = email;
  const bn = str(body, "business_name");
  if (bn !== undefined) fields.business_name = bn;
  const poc = str(body, "point_of_contact");
  if (poc !== undefined) fields.point_of_contact = poc;

  const svc = v1svc();
  // Match an existing customer by phone, then email (tenant-scoped) → update;
  // else insert. Equality lookups only — never interpolate caller input into a
  // PostgREST .or() string (that surface breaks on `,`/`(`/`)` and is an
  // injection vector).
  let existingId: string | null = null;
  const findId = async (col: "whatsapp_number" | "email", val: string) => {
    const { data: found } = await svc
      .from("users")
      .select("id")
      .eq("tenant_id", a.tenantId)
      .eq(col, val)
      .limit(1)
      .maybeSingle();
    return (found as { id: string } | null)?.id ?? null;
  };
  if (phone) existingId = await findId("whatsapp_number", phone);
  if (!existingId && email) existingId = await findId("email", email);

  if (existingId) {
    const { data, error } = await svc.from("users").update(fields).eq("id", existingId).eq("tenant_id", a.tenantId).select(COLS).single();
    if (error) return bad(error.message, 500);
    return ok(data, 200);
  }
  const { data, error } = await svc.from("users").insert({ tenant_id: a.tenantId, ...fields }).select(COLS).single();
  if (error) return bad(error.message, 500);
  return ok(data, 201);
}
