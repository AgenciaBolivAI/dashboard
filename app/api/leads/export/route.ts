import { NextResponse, type NextRequest } from "next/server";
import { getTenantBySlug } from "@/lib/tenant";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { listLeads } from "@/lib/queries/leads";

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(request: NextRequest) {
  await requireUser();

  const { searchParams } = new URL(request.url);
  const tenantSlug = searchParams.get("tenantSlug");
  if (!tenantSlug) {
    return NextResponse.json({ error: "tenantSlug required" }, { status: 400 });
  }

  const tenant = await getTenantBySlug(tenantSlug);
  await requireTenantAccess(tenant.id);

  const leads = await listLeads(tenant.id, {
    status: searchParams.get("status") ?? undefined,
    intent: searchParams.get("intent") ?? undefined,
    limit: 10_000,
  });

  const header = ["name", "whatsapp_number", "email", "intent", "status", "notes", "created_at"];
  const rows = leads.map((l) =>
    [
      l.name,
      l.whatsapp_number,
      l.email,
      l.intent,
      l.status,
      l.notes,
      l.created_at,
    ]
      .map(csvEscape)
      .join(","),
  );

  const csv = [header.join(","), ...rows].join("\n");
  const filename = `leads-${tenantSlug}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
