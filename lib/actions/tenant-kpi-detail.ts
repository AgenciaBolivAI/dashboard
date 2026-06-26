"use server";

import { getTranslations, getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireUser, requireTenantAccess } from "@/lib/auth";
import type { KpiDetail } from "@/lib/actions/admin-kpi-detail";

export type TenantKpiMetric =
  | "conversations"
  | "leads"
  | "reservations"
  | "revenue"
  | "voice"
  | "balance";

const PERIOD_DAYS: Record<string, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 };

/**
 * Drill-down rows behind a TENANT overview KPI tile. Hard tenant-scoped three
 * ways: (1) requireTenantAccess(tenantId) blocks non-members, (2) the RLS-bound
 * server client (createClient) so the DB itself rejects other tenants' rows,
 * and (3) an explicit `.eq("tenant_id", tenantId)` on every query. A tenant can
 * only ever see their own data.
 */
export async function getTenantKpiDetail(
  tenantId: string,
  metric: string,
  period: string,
): Promise<KpiDetail> {
  await requireUser();
  await requireTenantAccess(tenantId); // any member of THIS tenant; redirects otherwise

  const t = await getTranslations("overview");
  const locale = await getLocale();
  const supabase = await createClient();

  const days = PERIOD_DAYS[period] ?? 7;
  const curStart = new Date();
  curStart.setUTCHours(0, 0, 0, 0);
  curStart.setUTCDate(curStart.getUTCDate() - (days - 1));
  const curISO = curStart.toISOString();

  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  const num = (n: number) => n.toLocaleString(locale);
  const empty = t("dd_empty");

  // Belt: every query is scoped to this tenant id explicitly (RLS is the suspenders).
  const scope = <T,>(q: T) => (q as { eq: (c: string, v: string) => T }).eq("tenant_id", tenantId);

  const C = {
    customer: { key: "customer", label: t("dd_customer") },
    channel: { key: "channel", label: t("dd_channel") },
    status: { key: "status", label: t("dd_status") },
    date: { key: "date", label: t("dd_date"), align: "right" as const },
    phone: { key: "phone", label: t("dd_phone") },
    source: { key: "source", label: t("dd_source") },
    start: { key: "start", label: t("dd_start"), align: "right" as const },
    invoice: { key: "invoice", label: t("dd_invoice") },
    amount: { key: "amount", label: t("dd_amount"), align: "right" as const },
    direction: { key: "direction", label: t("dd_direction") },
    outcome: { key: "outcome", label: t("dd_outcome") },
    duration: { key: "duration", label: t("dd_duration"), align: "right" as const },
    type: { key: "type", label: t("dd_type") },
    credits: { key: "credits", label: t("dd_credits"), align: "right" as const },
    balance: { key: "balance", label: t("dd_balance"), align: "right" as const },
  };

  if (metric === "conversations") {
    const { data } = await scope(
      supabase
        .from("conversations")
        .select("channel, status, hitl_taken_over, last_message_at, users(name, whatsapp_number)"),
    )
      .gte("created_at", curISO)
      .order("last_message_at", { ascending: false })
      .limit(200);
    const rows = ((data ?? []) as unknown as Array<{
      channel: string | null;
      status: string | null;
      hitl_taken_over: boolean | null;
      last_message_at: string | null;
      users: { name: string | null; whatsapp_number: string | null } | null;
    }>).map((r) => ({
      customer: r.users?.name || r.users?.whatsapp_number || "—",
      channel: r.channel ?? "whatsapp",
      status: r.hitl_taken_over ? "hitl" : r.status ?? "—",
      date: fmtDate(r.last_message_at),
    }));
    return { columns: [C.customer, C.channel, C.status, C.date], rows, empty };
  }

  if (metric === "leads") {
    const { data } = await scope(
      supabase.from("leads").select("name, whatsapp_number, status, source, created_at"),
    )
      .gte("created_at", curISO)
      .order("created_at", { ascending: false })
      .limit(300);
    const rows = ((data ?? []) as Array<{
      name: string | null;
      whatsapp_number: string | null;
      status: string | null;
      source: string | null;
      created_at: string;
    }>).map((r) => ({
      customer: r.name || "—",
      phone: r.whatsapp_number || "—",
      status: r.status ?? "—",
      source: r.source ?? "—",
      date: fmtDate(r.created_at),
    }));
    return { columns: [C.customer, C.phone, C.status, C.source, C.date], rows, empty };
  }

  if (metric === "reservations") {
    const { data } = await scope(
      supabase.from("reservations").select("customer_name, start_at, status"),
    )
      .eq("status", "confirmed")
      .gte("created_at", curISO)
      .order("start_at", { ascending: false })
      .limit(200);
    const rows = ((data ?? []) as Array<{
      customer_name: string | null;
      start_at: string | null;
      status: string | null;
    }>).map((r) => ({
      customer: r.customer_name || "—",
      start: fmtDate(r.start_at),
      status: r.status ?? "—",
    }));
    return { columns: [C.customer, C.start, C.status], rows, empty };
  }

  if (metric === "revenue") {
    const { data } = await scope(
      supabase.from("invoices").select("number, customer_name, amount_paid_cents, paid_at"),
    )
      .not("paid_at", "is", null)
      .gte("paid_at", curISO)
      .order("paid_at", { ascending: false })
      .limit(200);
    const rows = ((data ?? []) as Array<{
      number: string | null;
      customer_name: string | null;
      amount_paid_cents: number | null;
      paid_at: string | null;
    }>).map((r) => ({
      invoice: r.number || "—",
      customer: r.customer_name || "—",
      amount: `$${((r.amount_paid_cents ?? 0) / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      date: fmtDate(r.paid_at),
    }));
    return { columns: [C.invoice, C.customer, C.amount, C.date], rows, empty };
  }

  if (metric === "voice") {
    const { data } = await scope(
      supabase.from("voice_conversations").select("direction, call_outcome, duration_seconds, started_at"),
    )
      .gte("started_at", curISO)
      .order("started_at", { ascending: false })
      .limit(200);
    const rows = ((data ?? []) as Array<{
      direction: string | null;
      call_outcome: string | null;
      duration_seconds: number | null;
      started_at: string | null;
    }>).map((r) => ({
      direction: r.direction ?? "—",
      outcome: r.call_outcome ?? "—",
      duration: `${Math.round((r.duration_seconds ?? 0))}s`,
      date: fmtDate(r.started_at),
    }));
    return { columns: [C.direction, C.outcome, C.duration, C.date], rows, empty };
  }

  if (metric === "balance") {
    const { data } = await scope(
      supabase.from("credit_transactions").select("type, credits_delta, balance_after, created_at"),
    )
      .gte("created_at", curISO)
      .order("created_at", { ascending: false })
      .limit(200);
    const rows = ((data ?? []) as Array<{
      type: string | null;
      credits_delta: number | null;
      balance_after: number | null;
      created_at: string;
    }>).map((r) => ({
      date: fmtDate(r.created_at),
      type: r.type ?? "—",
      credits: `${(r.credits_delta ?? 0) > 0 ? "+" : ""}${num(r.credits_delta ?? 0)}`,
      balance: num(r.balance_after ?? 0),
    }));
    return { columns: [C.date, C.type, C.credits, C.balance], rows, empty };
  }

  return { columns: [], rows: [], empty };
}
