import { NextRequest, NextResponse } from "next/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/invoices/export?tenant_id=<uuid>&status=<all|paid|...>&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns a CSV of invoices for the tenant. Money columns are in major
 * units (already divided by 100) so it's accountant-friendly. Use the
 * raw amount_cents columns if you want full precision.
 */
export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get("tenant_id");
  const status = req.nextUrl.searchParams.get("status");
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const detailed = req.nextUrl.searchParams.get("detailed") === "1";

  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
    return NextResponse.json({ error: "tenant_id inválido" }, { status: 400 });
  }
  await requireUser();
  await requireTenantAccess(tenantId, { minRole: "operator" });

  const supabase = await createClient();
  let q = supabase
    .from("invoices")
    .select(
      detailed
        ? "number, status, customer_name, customer_email, currency, subtotal_cents, tax_cents, total_cents, amount_paid_cents, application_fee_cents, issue_date, due_date, sent_at, paid_at, is_recurring, stripe_invoice_id, stripe_payment_link, invoice_items(position, description, quantity, unit_price_cents, tax_rate_bps, amount_cents)"
        : "number, status, customer_name, customer_email, currency, subtotal_cents, tax_cents, total_cents, amount_paid_cents, application_fee_cents, issue_date, due_date, sent_at, paid_at, is_recurring, stripe_invoice_id, stripe_payment_link",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (status === "recurring") {
    q = q.eq("is_recurring", true).is("recurrence_end_date", null);
  } else if (status && status !== "all") {
    q = q.eq("status", status);
  }
  if (from) q = q.gte("created_at", `${from}T00:00:00Z`);
  if (to) q = q.lte("created_at", `${to}T23:59:59Z`);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Double-cast through unknown — the inline relation in the select string
  // confuses Supabase's type-level query parser.
  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  const lines: string[] = [];

  if (detailed) {
    const HEADERS = [
      "number", "status", "customer_name", "customer_email", "currency",
      "item_position", "item_description", "item_quantity", "item_unit_price",
      "item_tax_rate_percent", "item_amount", "item_tax_amount", "item_total_with_tax",
      "issue_date", "due_date", "sent_at", "paid_at",
      "is_recurring", "stripe_invoice_id",
    ];
    lines.push(HEADERS.join(","));
    for (const r of rows) {
      const items = (r.invoice_items as Array<Record<string, unknown>> | null) ?? [];
      if (items.length === 0) {
        // Surface the invoice header even with no items so totals stay reconcileable
        lines.push(
          [
            csv(r.number), csv(r.status), csv(r.customer_name), csv(r.customer_email), csv(r.currency),
            "", "", "", "", "", "", "", "",
            csv(r.issue_date), csv(r.due_date), csv(r.sent_at), csv(r.paid_at),
            r.is_recurring ? "true" : "false", csv(r.stripe_invoice_id),
          ].join(","),
        );
        continue;
      }
      // Sort by position so the CSV reads top-down per invoice
      items.sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0));
      for (const it of items) {
        const amount = Number(it.amount_cents ?? 0);
        const taxRateBps = Number(it.tax_rate_bps ?? 0);
        const taxAmount = Math.round((amount * taxRateBps) / 10_000);
        lines.push(
          [
            csv(r.number), csv(r.status), csv(r.customer_name), csv(r.customer_email), csv(r.currency),
            String(it.position ?? ""),
            csv(it.description),
            String(it.quantity ?? ""),
            money(it.unit_price_cents),
            (taxRateBps / 100).toFixed(2),
            money(amount),
            money(taxAmount),
            money(amount + taxAmount),
            csv(r.issue_date), csv(r.due_date), csv(r.sent_at), csv(r.paid_at),
            r.is_recurring ? "true" : "false", csv(r.stripe_invoice_id),
          ].join(","),
        );
      }
    }
  } else {
    const HEADERS = [
      "number", "status", "customer_name", "customer_email", "currency",
      "subtotal", "tax", "total", "amount_paid", "application_fee",
      "issue_date", "due_date", "sent_at", "paid_at",
      "is_recurring", "stripe_invoice_id", "stripe_payment_link",
    ];
    lines.push(HEADERS.join(","));
    for (const r of rows) {
      lines.push(
        [
          csv(r.number), csv(r.status), csv(r.customer_name), csv(r.customer_email), csv(r.currency),
          money(r.subtotal_cents), money(r.tax_cents), money(r.total_cents),
          money(r.amount_paid_cents), money(r.application_fee_cents),
          csv(r.issue_date), csv(r.due_date), csv(r.sent_at), csv(r.paid_at),
          r.is_recurring ? "true" : "false",
          csv(r.stripe_invoice_id), csv(r.stripe_payment_link),
        ].join(","),
      );
    }
  }

  const filename = `bolivai-facturas${detailed ? "-detallado" : ""}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function csv(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function money(cents: unknown): string {
  if (cents === null || cents === undefined) return "0.00";
  return (Number(cents) / 100).toFixed(2);
}
