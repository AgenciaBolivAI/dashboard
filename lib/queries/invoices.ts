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
  stripe_invoice_pdf: string | null;
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
  "id, tenant_id, reservation_id, customer_name, customer_email, customer_phone, customer_address, number, status, currency, subtotal_cents, tax_cents, total_cents, amount_paid_cents, application_fee_cents, issue_date, due_date, sent_at, paid_at, stripe_invoice_id, stripe_payment_link, stripe_invoice_pdf, stripe_subscription_id, stripe_customer_id, is_recurring, recurrence_interval, recurrence_interval_count, recurrence_end_date, notes, created_at, updated_at";

export type InvoiceListFilter = InvoiceStatus | "all" | "recurring";

/** Strip the PostgREST `.or()` grammar separators from a free-text term. */
function sanitizeSearch(raw: string): string {
  return raw.replace(/[,()*]/g, " ").trim();
}

// Apply the status + search filters shared by listInvoices / countInvoices.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyInvoiceFilters<T extends { eq: any; is: any; or: any }>(
  q: T,
  status: InvoiceListFilter | undefined,
  term: string,
): T {
  if (status === "recurring") {
    // "Active subscriptions" — recurring rows whose end date hasn't been stamped
    q = q.eq("is_recurring", true).is("recurrence_end_date", null);
  } else if (status && status !== "all") {
    q = q.eq("status", status);
  }
  if (term) {
    q = q.or(`number.ilike.*${term}*,customer_name.ilike.*${term}*,customer_email.ilike.*${term}*`);
  }
  return q;
}

export async function listInvoices(
  tenantId: string,
  opts: { status?: InvoiceListFilter; search?: string; limit?: number; offset?: number } = {},
): Promise<Invoice[]> {
  const supabase = await createClient();
  const term = opts.search ? sanitizeSearch(opts.search) : "";
  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? 100;
  let q = supabase
    .from("invoices")
    .select(SELECT_COLS)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  q = applyInvoiceFilters(q, opts.status, term);
  const { data } = await q;
  return (data ?? []) as Invoice[];
}

/** Total invoices matching the same status/search filters — drives pagination. */
export async function countInvoices(
  tenantId: string,
  opts: { status?: InvoiceListFilter; search?: string } = {},
): Promise<number> {
  const supabase = await createClient();
  const term = opts.search ? sanitizeSearch(opts.search) : "";
  let q = supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  q = applyInvoiceFilters(q, opts.status, term);
  const { count } = await q;
  return count ?? 0;
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

export type RevenueSummary = {
  currency: string;
  paid_this_month_cents: number;
  paid_ytd_cents: number;
  outstanding_cents: number;
  count_paid_this_month: number;
  active_subscriptions: number;
};

/**
 * Higher-level revenue rollup for the overview page. Numbers are scoped
 * to the tenant's default currency to keep the card readable; tenants
 * who invoice in multiple currencies see the rollup for their primary
 * currency only.
 */
export async function getRevenueSummary(
  tenantId: string,
  currency: string,
): Promise<RevenueSummary> {
  const supabase = await createClient();
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1)).toISOString();

  const [paidThisMonthRes, paidYtdRes, outstandingRes, activeSubsRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("amount_paid_cents")
      .eq("tenant_id", tenantId)
      .eq("currency", currency)
      .eq("status", "paid")
      .gte("paid_at", startOfMonth),
    supabase
      .from("invoices")
      .select("amount_paid_cents")
      .eq("tenant_id", tenantId)
      .eq("currency", currency)
      .eq("status", "paid")
      .gte("paid_at", startOfYear),
    supabase
      .from("invoices")
      .select("total_cents, amount_paid_cents")
      .eq("tenant_id", tenantId)
      .eq("currency", currency)
      .in("status", ["open", "past_due"]),
    supabase
      .from("invoices")
      .select("stripe_subscription_id", { count: "exact", head: false })
      .eq("tenant_id", tenantId)
      .eq("is_recurring", true)
      .not("stripe_subscription_id", "is", null)
      .is("recurrence_end_date", null),
  ]);

  const paidMonth = ((paidThisMonthRes.data ?? []) as Array<{ amount_paid_cents: number }>)
    .reduce((s, r) => s + (r.amount_paid_cents ?? 0), 0);
  const paidYtd = ((paidYtdRes.data ?? []) as Array<{ amount_paid_cents: number }>)
    .reduce((s, r) => s + (r.amount_paid_cents ?? 0), 0);
  const outstanding = ((outstandingRes.data ?? []) as Array<{ total_cents: number; amount_paid_cents: number }>)
    .reduce((s, r) => s + ((r.total_cents ?? 0) - (r.amount_paid_cents ?? 0)), 0);

  // Dedup subscription IDs (one sub can have many invoice rows after cycles)
  const subIds = new Set(
    ((activeSubsRes.data ?? []) as Array<{ stripe_subscription_id: string | null }>)
      .map((r) => r.stripe_subscription_id)
      .filter(Boolean),
  );

  return {
    currency,
    paid_this_month_cents: paidMonth,
    paid_ytd_cents: paidYtd,
    outstanding_cents: outstanding,
    count_paid_this_month: paidThisMonthRes.data?.length ?? 0,
    active_subscriptions: subIds.size,
  };
}

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
