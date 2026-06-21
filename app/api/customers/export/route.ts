import { NextResponse, type NextRequest } from "next/server";
import { getTenantBySlug } from "@/lib/tenant";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toCsv, csvHeaders } from "@/lib/csv";

/**
 * CSV export of a tenant's customers (the `users` table). Mirrors the customers
 * list page filters (search `q`, `vip`). Access gated by requireTenantAccess;
 * RLS scopes rows to the tenant.
 */
export async function GET(request: NextRequest) {
  await requireUser();

  const { searchParams } = new URL(request.url);
  const tenantSlug = searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }

  const tenant = await getTenantBySlug(tenantSlug);
  await requireTenantAccess(tenant.id);

  const supabase = await createClient();
  let q = supabase
    .from("users")
    .select("name, whatsapp_number, email, is_vip, created_at")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: false })
    .limit(10_000);

  if (searchParams.get("vip") === "1") q = q.eq("is_vip", true);
  const term = searchParams.get("q")?.replace(/[,()*]/g, " ").trim();
  if (term) {
    q = q.or(`name.ilike.*${term}*,whatsapp_number.ilike.*${term}*,email.ilike.*${term}*`);
  }

  const { data } = await q;
  const rows = ((data ?? []) as Array<{
    name: string | null;
    whatsapp_number: string | null;
    email: string | null;
    is_vip: boolean | null;
    created_at: string | null;
  }>).map((u) => [u.name, u.whatsapp_number, u.email, u.is_vip ? "yes" : "no", u.created_at]);

  const csv = toCsv(["name", "whatsapp_number", "email", "vip", "created_at"], rows);
  const filename = `customers-${tenantSlug}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, { headers: csvHeaders(filename) });
}
