/**
 * /api/v1/leads
 *   GET  — list leads, newest first (Zapier "New Lead" trigger). ?since=ISO &?limit=
 *   POST — create a lead (Zapier "Create Lead" action).
 *
 * Tenant is resolved from the API key; all rows are hard-scoped to it.
 */
import { apiAuth, isErr, v1svc, listParams, jsonBody, str, ok, bad } from "@/lib/api/v1";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/leads-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLS = "id, name, whatsapp_number, email, intent, status, source, notes, value_cents, currency, created_at";

export async function GET(req: Request) {
  const a = await apiAuth(req);
  if (isErr(a)) return a;
  const { since, limit } = listParams(req);
  let q = v1svc()
    .from("leads")
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

  const name = str(body, "name");
  const phone = str(body, "whatsapp_number", "phone");
  const email = str(body, "email");
  if (!name && !phone && !email) return bad("Provide at least one of: name, phone (whatsapp_number), email.");

  // Validate status against the canonical enum — never persist an arbitrary
  // string (a bad status escapes pipeline/DNC logic). Default to "new".
  const statusRaw = str(body, "status");
  if (statusRaw && !(LEAD_STATUSES as readonly string[]).includes(statusRaw)) {
    return bad(`Invalid status "${statusRaw}". Allowed: ${LEAD_STATUSES.join(", ")}.`);
  }
  const status = (statusRaw as LeadStatus | undefined) ?? "new";

  // vertical/city/website/address aren't columns — keep them in metadata.
  const metadata: Record<string, unknown> = {};
  for (const k of ["vertical", "city", "website", "address", "company"]) {
    const v = str(body, k);
    if (v) metadata[k] = v;
  }

  const row = {
    tenant_id: a.tenantId,
    name: name ?? null,
    whatsapp_number: phone ?? null,
    email: email ?? null,
    intent: str(body, "intent") ?? null,
    status,
    source: str(body, "source") ?? "zapier",
    notes: str(body, "notes") ?? null,
    metadata: Object.keys(metadata).length ? metadata : {},
  };
  const { data, error } = await v1svc().from("leads").insert(row).select(COLS).single();
  if (error) return bad(error.message, 500);
  return ok(data, 201);
}
