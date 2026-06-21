import { NextResponse, type NextRequest } from "next/server";
import { getTenantBySlug } from "@/lib/tenant";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toCsv, csvHeaders } from "@/lib/csv";

/**
 * CSV export of a tenant's reservations, with the service name joined.
 * Optional filters: status, and a start_at range (from / to, ISO dates).
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
    .from("reservations")
    .select(
      "customer_name, customer_phone, customer_email, status, start_at, end_at, duration_minutes, created_at, services:service_id ( name )",
    )
    .eq("tenant_id", tenant.id)
    .order("start_at", { ascending: false })
    .limit(10_000);

  const status = searchParams.get("status");
  if (status && status !== "all") q = q.eq("status", status);
  const from = searchParams.get("from");
  if (from) q = q.gte("start_at", from);
  const to = searchParams.get("to");
  if (to) q = q.lte("start_at", to);

  const { data } = await q;
  const rows = ((data ?? []) as Array<{
    customer_name: string | null;
    customer_phone: string | null;
    customer_email: string | null;
    status: string | null;
    start_at: string | null;
    end_at: string | null;
    duration_minutes: number | null;
    created_at: string | null;
    services: { name: string | null } | { name: string | null }[] | null;
  }>).map((r) => {
    const svc = Array.isArray(r.services) ? r.services[0] : r.services;
    return [
      r.customer_name,
      r.customer_phone,
      r.customer_email,
      svc?.name ?? "",
      r.status,
      r.start_at,
      r.end_at,
      r.duration_minutes,
      r.created_at,
    ];
  });

  const csv = toCsv(
    [
      "customer_name",
      "customer_phone",
      "customer_email",
      "service",
      "status",
      "start_at",
      "end_at",
      "duration_minutes",
      "created_at",
    ],
    rows,
  );
  const filename = `reservations-${tenantSlug}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, { headers: csvHeaders(filename) });
}
