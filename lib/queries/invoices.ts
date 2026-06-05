import { createClient } from "@/lib/supabase/server";

export type InvoiceStatus =
  | "draft"
  | "open"
  | "paid"
  | "void"
  | "uncollectible"
  | "past_due";

export type Invoice = {
  id: string;
  tenant_id: string;
  reservation_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  number: string | null;
  status: InvoiceStatus;
  currency: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  amount_paid_cents: number;
  application_fee_cents: number;
  issue_date: string | null;
  due_date: string | null;
  sent_at: string | null;
  paid_at: string | null;
  stripe_invoice_id: string | null;
  stripe_payment_link: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  is_recurring: boolean;
  recurrence_interval: "week" | "month" | "year" | null;
  recurrence_interval_count: number | null;
  recurrence_end_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type InvoiceItem = {
  id: string;
  invoice_id: string;
  position: number;
  description: string;
  quantity: number;
  unit_price_cents: number;
  tax_rate_bps: number;
  amount_cents: number;
  service_id: string | null;
};

const SELECT_COLS =
  "id, tenant_id, reservation_id, customer_name, customer_email, customer_phone, customer_address, number, status, currency, subtotal_cents, tax_cents, total_cents, amount_paid_cents, application_fee_cents, issue_date, due_date, sent_at, paid_at, stripe_invoice_id, stripe_payment_link, stripe_subscription_id, stripe_customer_id, is_recurring, recurrence_interval, recurrence_interval_count, recurrence_end_date, notes, created_at, updated_at";

export async function listInvoices(
  tenantId: string,
  opts: { status?: InvoiceStatus | "all"; limit?: number } = {},
): Promise<Invoice[]> {
  const supabase = await createClient();
  let q = supabase
    .from("invoices")
    .select(SELECT_COLS)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.status && opts.status !== "all") {
    q = q.eq("status", opts.status);
  }
  const { data } = await q;
  return (data ?? []) as Invoice[];
}

export async function getInvoice(
  tenantId: string,
  invoiceId: string,
): Promise<{ invoice: Invoice; items: InvoiceItem[] } | null> {
  const supabase = await createClient();
  const [invRes, itemsRes] = await Promise.all([
    supabase
      .from("invoices")
      .select(SELECT_COLS)
      .eq("id", invoiceId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("invoice_items")
      .select(
        "id, invoice_id, position, description, quantity, unit_price_cents, tax_rate_bps, amount_cents, service_id",
      )
      .eq("invoice_id", invoiceId)
      .order("position", { ascending: true }),
  ]);
  if (!invRes.data) return null;
  return {
    invoice: invRes.data as Invoice,
    items: (itemsRes.data ?? []) as InvoiceItem[],
  };
}

export type InvoiceSummary = {
  count_total: number;
  count_paid: number;
  count_open: number;
  count_past_due: number;
  paid_cents: number;
  outstanding_cents: number;
  currency: string;
};

export async function getInvoiceSummary(
  tenantId: string,
  currency: string,
): Promise<InvoiceSummary> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("invoices")
    .select("status, total_cents, amount_paid_cents, currency")
    .eq("tenant_id", tenantId)
    .eq("currency", currency);
  const rows = (data ?? []) as Array<{
    status: string;
    total_cents: number;
    amount_paid_cents: number;
    currency: string;
  }>;
  let countPaid = 0;
  let countOpen = 0;
  let countPastDue = 0;
  let paidCents = 0;
  let outstandingCents = 0;
  for (const r of rows) {
    if (r.status === "paid") {
      countPaid++;
      paidCents += r.amount_paid_cents;
    } else if (r.status === "open") {
      countOpen++;
      outstandingCents += r.total_cents - r.amount_paid_cents;
    } else if (r.status === "past_due") {
      countPastDue++;
      outstandingCents += r.total_cents - r.amount_paid_cents;
    }
  }
  return {
    count_total: rows.length,
    count_paid: countPaid,
    count_open: countOpen,
    count_past_due: countPastDue,
    paid_cents: paidCents,
    outstanding_cents: outstandingCents,
    currency,
  };
}
