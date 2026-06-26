"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations, getLocale } from "next-intl/server";
import { createServiceClient } from "@/lib/supabase/service";
import { requireUser, isBolivAIAdmin } from "@/lib/auth";
import {
  fmtCents,
  fmtUsd,
  getActionBreakdown,
  getTenantPnlSummary,
  type PnlWindow,
} from "@/lib/queries/admin-pnl";

export type KpiMetric =
  | "founders_all"
  | "founders_window"
  | "topups"
  | "zero"
  | "low"
  | "active_tenants"
  | "dau"
  | "wau"
  | "mau"
  | "registered_users"
  | "actions"
  | "tenant_revenue";

export type KpiDetailColumn = { key: string; label: string; align?: "left" | "right" };
export type KpiDetail = {
  columns: KpiDetailColumn[];
  rows: Record<string, string>[];
  empty: string;
  error?: string;
};

function svc(): SupabaseClient {
  return createServiceClient() as unknown as SupabaseClient;
}

/** UTC window start, mirroring the platform_pnl / founders_fee_revenue SQL CASE. */
function windowStartIso(w: string): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const mo = now.getUTCMonth();
  const d = now.getUTCDate();
  let start: Date;
  switch (w) {
    case "today":
      start = new Date(Date.UTC(y, mo, d));
      break;
    case "week": {
      // date_trunc('week') = Monday 00:00 UTC
      const day = new Date(Date.UTC(y, mo, d));
      const dow = (day.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
      day.setUTCDate(day.getUTCDate() - dow);
      start = day;
      break;
    }
    case "month":
      start = new Date(Date.UTC(y, mo, 1));
      break;
    case "24h":
      start = new Date(now.getTime() - 24 * 3600_000);
      break;
    case "7d":
      start = new Date(now.getTime() - 7 * 86_400_000);
      break;
    case "30d":
      start = new Date(now.getTime() - 30 * 86_400_000);
      break;
    case "90d":
      start = new Date(now.getTime() - 90 * 86_400_000);
      break;
    default: // "all"
      start = new Date(0);
  }
  return start.toISOString();
}

/**
 * Drill-down rows behind an admin-overview KPI tile. Admin-only. Returns a
 * generic { columns, rows } the dialog renders as a table; all values are
 * pre-formatted strings so the client just paints them.
 */
export async function getAdminKpiDetail(metric: string, window: string): Promise<KpiDetail> {
  await requireUser();
  if (!(await isBolivAIAdmin())) {
    return { columns: [], rows: [], empty: "", error: "forbidden" };
  }
  const t = await getTranslations("admin_overview");
  const locale = await getLocale();
  const s = svc();
  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" }) : "—";
  const dtFull = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

  const C = {
    num: { key: "num", label: t("detail_col_num") },
    tenant: { key: "tenant", label: t("detail_col_tenant") },
    amount: { key: "amount", label: t("detail_col_amount"), align: "right" as const },
    date: { key: "date", label: t("detail_col_date"), align: "right" as const },
    code: { key: "code", label: t("detail_col_code") },
    status: { key: "status", label: t("detail_col_status") },
    balance: { key: "balance", label: t("detail_col_balance"), align: "right" as const },
    email: { key: "email", label: t("detail_col_email") },
    last_active: { key: "last_active", label: t("detail_col_last_active"), align: "right" as const },
    registered: { key: "registered", label: t("detail_col_registered"), align: "right" as const },
    action: { key: "action", label: t("detail_col_action") },
    units: { key: "units", label: t("detail_col_units"), align: "right" as const },
    revenue: { key: "revenue", label: t("detail_col_revenue"), align: "right" as const },
    cost: { key: "cost", label: t("detail_col_cost"), align: "right" as const },
    margin: { key: "margin", label: t("detail_col_margin"), align: "right" as const },
  };
  const empty = t("detail_empty");

  // ── Active dashboard users behind DAU / WAU / MAU / Registered ─────────
  if (metric === "dau" || metric === "wau" || metric === "mau" || metric === "registered_users") {
    const kind = metric === "registered_users" ? "registered" : metric;
    const { data } = await s.rpc("admin_active_users", { p_kind: kind });
    const rows = ((data ?? []) as Array<{
      email: string;
      business: string | null;
      last_active: string | null;
      registered: string | null;
    }>).map((r) => ({
      email: r.email,
      tenant: r.business || "—",
      last_active: dtFull(r.last_active),
      registered: fmtDate(r.registered),
    }));
    return { columns: [C.email, C.tenant, C.last_active, C.registered], rows, empty };
  }

  // ── Per-action breakdown (API cost / usage / margin tiles) ────────────
  if (metric === "actions") {
    const acts = await getActionBreakdown(window as PnlWindow);
    const rows = acts.map((a) => ({
      action: a.action_key,
      units: a.units.toLocaleString(locale),
      revenue: fmtCents(a.revenue_credits),
      cost: fmtUsd(a.cost_micros),
      margin: fmtUsd(a.margin_micros),
    }));
    return { columns: [C.action, C.units, C.revenue, C.cost, C.margin], rows, empty };
  }

  // ── Per-tenant revenue (ARPU tile) ────────────────────────────────────
  if (metric === "tenant_revenue") {
    const tps = await getTenantPnlSummary(window as PnlWindow);
    const rows = tps.map((tp) => ({
      tenant: `${tp.name} (/${tp.slug})`,
      revenue: fmtCents(tp.revenue_cents),
      cost: fmtUsd(tp.cost_micros),
      margin: fmtUsd(tp.margin_micros),
    }));
    return { columns: [C.tenant, C.revenue, C.cost, C.margin], rows, empty };
  }

  // ── Founding members (all-time or within the window) ──────────────────
  if (metric === "founders_all" || metric === "founders_window") {
    let q = s
      .from("tenants")
      .select("name, slug, founding_member_number, lifetime_paid_cents, lifetime_code, lifetime_access_at")
      .gt("lifetime_paid_cents", 0)
      .order("lifetime_access_at", { ascending: false, nullsFirst: false });
    if (metric === "founders_window") q = q.gte("lifetime_access_at", windowStartIso(window));
    const { data } = await q;
    const rows = ((data ?? []) as unknown as Array<{
      name: string;
      slug: string;
      founding_member_number: number | null;
      lifetime_paid_cents: number | null;
      lifetime_code: string | null;
      lifetime_access_at: string | null;
    }>).map((r) => ({
      num: r.founding_member_number ? `#${r.founding_member_number}` : "—",
      tenant: `${r.name} (/${r.slug})`,
      amount: fmtCents(r.lifetime_paid_cents ?? 0),
      code: r.lifetime_code || "—",
      date: fmtDate(r.lifetime_access_at),
    }));
    return { columns: [C.num, C.tenant, C.amount, C.code, C.date], rows, empty };
  }

  // ── Credit top-ups within the window ──────────────────────────────────
  if (metric === "topups") {
    const { data } = await s
      .from("credit_transactions")
      .select("credits_delta, metadata, created_at, tenants(name, slug)")
      .eq("type", "top_up")
      .gte("created_at", windowStartIso(window))
      .order("created_at", { ascending: false })
      .limit(200);
    const rows = ((data ?? []) as unknown as Array<{
      credits_delta: number;
      metadata: Record<string, unknown> | null;
      created_at: string;
      tenants: { name: string; slug: string } | null;
    }>).map((r) => {
      const cents = Number((r.metadata?.paid_cents as number | undefined) ?? r.credits_delta) || 0;
      return {
        date: fmtDate(r.created_at),
        tenant: r.tenants ? `${r.tenants.name} (/${r.tenants.slug})` : "—",
        amount: fmtCents(cents),
      };
    });
    return { columns: [C.date, C.tenant, C.amount], rows, empty };
  }

  // ── Tenant balance health (zero / low) ────────────────────────────────
  if (metric === "zero" || metric === "low") {
    const { data } = await s
      .from("credit_accounts")
      .select("balance_credits, reserved_credits, low_balance_threshold, tenants(name, slug, status)");
    const all = ((data ?? []) as unknown as Array<{
      balance_credits: number;
      reserved_credits: number;
      low_balance_threshold: number;
      tenants: { name: string; slug: string; status: string } | null;
    }>)
      .map((r) => ({ ...r, available: (r.balance_credits ?? 0) - (r.reserved_credits ?? 0) }))
      .filter((r) =>
        metric === "zero"
          ? r.available <= 0
          : r.available > 0 && r.available <= (r.low_balance_threshold ?? 0),
      )
      .sort((a, b) => a.available - b.available);
    const rows = all.map((r) => ({
      tenant: r.tenants ? `${r.tenants.name} (/${r.tenants.slug})` : "—",
      status: r.tenants?.status ?? "—",
      balance: fmtCents(r.available),
    }));
    return { columns: [C.tenant, C.status, C.balance], rows, empty };
  }

  // ── All tenants + balance (active-tenants tile) ───────────────────────
  if (metric === "active_tenants") {
    const { data } = await s
      .from("credit_accounts")
      .select("balance_credits, reserved_credits, tenants(name, slug, status, created_at)");
    const rows = ((data ?? []) as unknown as Array<{
      balance_credits: number;
      reserved_credits: number;
      tenants: { name: string; slug: string; status: string; created_at: string } | null;
    }>)
      .filter((r) => r.tenants)
      .map((r) => ({
        tenant: `${r.tenants!.name} (/${r.tenants!.slug})`,
        status: r.tenants!.status,
        balance: fmtCents((r.balance_credits ?? 0) - (r.reserved_credits ?? 0)),
        _sort: r.tenants!.status === "active" ? "0" : "1",
      }))
      .sort((a, b) => (a._sort + a.tenant).localeCompare(b._sort + b.tenant))
      .map(({ _sort, ...rest }) => { void _sort; return rest; });
    return { columns: [C.tenant, C.status, C.balance], rows, empty };
  }

  // Unknown metric — never fall through to returning data.
  return { columns: [], rows: [], empty };
}
