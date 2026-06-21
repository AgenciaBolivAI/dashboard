import { createClient } from "@/lib/supabase/server";

export type CustomerListRow = {
  id: string;
  name: string | null;
  whatsapp_number: string | null;
  is_vip: boolean;
  reservations_count: number;
  last_seen_at: string | null;
};

/**
 * Listing for /customers — one row per user_row in this tenant, with a
 * lightweight aggregate of how many reservations they have. We sort by
 * recent activity (last reservation start_at OR user.created_at).
 */
export async function listCustomers(
  tenantId: string,
  opts: { search?: string; vipOnly?: boolean; offset?: number; limit?: number } = {},
): Promise<{ rows: CustomerListRow[]; total: number }> {
  const supabase = await createClient();
  let q = supabase
    .from("users")
    .select(
      "id, name, whatsapp_number, is_vip, created_at, reservations(start_at)",
      { count: "exact" },
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (opts.vipOnly) q = q.eq("is_vip", true);
  if (opts.search) {
    // Match against name OR phone. Use ilike for case-insensitive partial.
    const s = `%${opts.search.replace(/[%_]/g, "")}%`;
    q = q.or(`name.ilike.${s},whatsapp_number.ilike.${s}`);
  }

  // Pagination window + total count, so the page can show "1–50 of 710" and
  // page through all customers (was hard-capped at 200, no count).
  if (opts.offset != null) {
    const from = opts.offset;
    const to = from + (opts.limit ?? 50) - 1;
    q = q.range(from, to);
  } else {
    q = q.limit(opts.limit ?? 200);
  }

  const { data, count } = await q;
  type Raw = {
    id: string;
    name: string | null;
    whatsapp_number: string | null;
    is_vip: boolean;
    created_at: string;
    reservations: Array<{ start_at: string }> | null;
  };
  const rows = ((data ?? []) as unknown as Raw[]).map((u) => {
    const reservations = u.reservations ?? [];
    const lastResv = reservations
      .map((r) => r.start_at)
      .sort()
      .pop();
    return {
      id: u.id,
      name: u.name,
      whatsapp_number: u.whatsapp_number,
      is_vip: u.is_vip,
      reservations_count: reservations.length,
      last_seen_at: lastResv ?? u.created_at,
    };
  });
  return { rows, total: count ?? 0 };
}

export type Customer360 = {
  id: string;
  name: string | null;
  whatsapp_number: string | null;
  email: string | null;
  business_name: string | null;
  point_of_contact: string | null;
  is_vip: boolean;
  tenant_notes: string | null;
  facts: string | null;
  created_at: string;
  reservations: Array<{
    id: string;
    start_at: string;
    end_at: string;
    duration_minutes: number;
    status: string;
    service_name: string | null;
    meeting_url: string | null;
  }>;
  invoices: Array<{
    id: string;
    number: string | null;
    status: string;
    currency: string;
    total_cents: number;
    amount_paid_cents: number;
    created_at: string;
  }>;
  lifetime_spend_cents: number;
  outstanding_cents: number;
  active_subscriptions: number;
};

export async function getCustomer360(
  tenantId: string,
  userId: string,
): Promise<Customer360 | null> {
  const supabase = await createClient();
  const [userRes, resvRes] = await Promise.all([
    supabase
      .from("users")
      .select(
        "id, name, whatsapp_number, email, business_name, point_of_contact, is_vip, tenant_notes, facts, created_at" as never,
      )
      .eq("id", userId)
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("reservations")
      .select(
        "id, start_at, end_at, duration_minutes, status, customer_phone, meeting_url, services(name)",
      )
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .order("start_at", { ascending: false })
      .limit(50),
  ]);

  if (!userRes.data) return null;
  const user = userRes.data as unknown as {
    id: string;
    name: string | null;
    whatsapp_number: string | null;
    email: string | null;
    business_name: string | null;
    point_of_contact: string | null;
    is_vip: boolean;
    tenant_notes: string | null;
    facts: string | null;
    created_at: string;
  };

  const phone = user.whatsapp_number ?? null;
  const e164 = phone ? `+${phone.replace(/^\+/, "")}` : null;

  // Pull invoices either by phone (most common path — agent-booked) or by
  // email if we have one. We accept the wider net of either match.
  let invoices: Customer360["invoices"] = [];
  let lifetimeSpend = 0;
  let outstanding = 0;
  let activeSubs = 0;
  if (e164 || user.email) {
    const ors: string[] = [];
    if (e164) ors.push(`customer_phone.eq.${e164}`);
    if (user.email) ors.push(`customer_email.eq.${user.email}`);
    const { data } = await supabase
      .from("invoices")
      .select(
        "id, number, status, currency, total_cents, amount_paid_cents, created_at, is_recurring, recurrence_end_date, stripe_subscription_id",
      )
      .eq("tenant_id", tenantId)
      .or(ors.join(","))
      .order("created_at", { ascending: false })
      .limit(100);
    const rows = (data ?? []) as Array<{
      id: string;
      number: string | null;
      status: string;
      currency: string;
      total_cents: number;
      amount_paid_cents: number;
      created_at: string;
      is_recurring: boolean;
      recurrence_end_date: string | null;
      stripe_subscription_id: string | null;
    }>;
    invoices = rows.map(({
      id, number, status, currency, total_cents, amount_paid_cents, created_at,
    }) => ({ id, number, status, currency, total_cents, amount_paid_cents, created_at }));

    const subs = new Set<string>();
    for (const r of rows) {
      if (r.status === "paid") lifetimeSpend += r.amount_paid_cents;
      if (r.status === "open" || r.status === "past_due") {
        outstanding += r.total_cents - r.amount_paid_cents;
      }
      if (r.is_recurring && r.stripe_subscription_id && !r.recurrence_end_date) {
        subs.add(r.stripe_subscription_id);
      }
    }
    activeSubs = subs.size;
  }

  return {
    ...user,
    reservations: ((resvRes.data ?? []) as Array<{
      id: string;
      start_at: string;
      end_at: string;
      duration_minutes: number;
      status: string;
      meeting_url: string | null;
      services: { name: string } | null;
    }>).map((r) => ({
      id: r.id,
      start_at: r.start_at,
      end_at: r.end_at,
      duration_minutes: r.duration_minutes,
      status: r.status,
      meeting_url: r.meeting_url,
      service_name: r.services?.name ?? null,
    })),
    invoices,
    lifetime_spend_cents: lifetimeSpend,
    outstanding_cents: outstanding,
    active_subscriptions: activeSubs,
  };
}
