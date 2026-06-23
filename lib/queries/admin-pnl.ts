import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";

export type PlatformPnl = {
  window_start: string;
  revenue_micros: number;
  topup_cents: number;
  usage_credits: number;
  cost_micros: number;
  margin_micros: number;
  margin_pct: number | null;
  active_tenants: number;
  total_tenants: number;
  tenants_at_zero: number;
  tenants_low_balance: number;
};

export type ActionBreakdown = {
  action_key: string;
  units: number;
  revenue_credits: number;
  cost_micros: number;
  margin_micros: number;
  margin_pct: number | null;
  unique_tenants: number;
};

export type TenantPnl = {
  tenant_id: string;
  slug: string;
  name: string;
  status: string;
  balance_credits: number;
  revenue_cents: number;
  usage_credits: number;
  cost_micros: number;
  margin_micros: number;
  margin_pct: number | null;
  last_activity_at: string | null;
};

export type DailyTimeseriesPoint = {
  day: string;
  revenue_cents: number;
  usage_credits: number;
  cost_micros: number;
  margin_micros: number;
};

export type PnlWindow =
  | "today"
  | "24h"
  | "week"
  | "7d"
  | "month"
  | "30d"
  | "90d"
  | "all";

export async function getPlatformPnl(window: PnlWindow = "month"): Promise<PlatformPnl | null> {
  const svc = createServiceClient();
  const { data } = await svc.rpc("platform_pnl", { p_window: window });
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as PlatformPnl | null;
}

export type FoundersFee = {
  paid_count: number;
  paid_cents: number;
  all_time_count: number;
  all_time_cents: number;
};

/** Founding Member ($40 lifetime fee) cash collected — windowed + all-time. */
export async function getFoundersFeeRevenue(window: PnlWindow = "month"): Promise<FoundersFee | null> {
  // founders_fee_revenue isn't in the generated DB types yet — loosely-typed client.
  const svc = createServiceClient() as unknown as SupabaseClient;
  const { data } = await svc.rpc("founders_fee_revenue", { p_window: window });
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as FoundersFee | null;
}

export async function getActionBreakdown(window: PnlWindow = "7d"): Promise<ActionBreakdown[]> {
  const svc = createServiceClient();
  const { data } = await svc.rpc("platform_action_breakdown", { p_window: window });
  return (data ?? []) as ActionBreakdown[];
}

export async function getTenantPnlSummary(window: PnlWindow = "month"): Promise<TenantPnl[]> {
  const svc = createServiceClient();
  const { data } = await svc.rpc("tenant_pnl_summary", { p_window: window });
  return (data ?? []) as TenantPnl[];
}

export async function getPlatformDailyTimeseries(days = 30): Promise<DailyTimeseriesPoint[]> {
  const svc = createServiceClient();
  const { data } = await svc.rpc("platform_daily_timeseries", { p_days: days });
  return (data ?? []) as DailyTimeseriesPoint[];
}

// ── Formatters ──────────────────────────────────────────────────────
export function microsToDollars(micros: number): number {
  return micros / 1_000_000;
}

export function fmtUsd(micros: number, opts?: { showSign?: boolean; decimals?: number }): string {
  const dollars = microsToDollars(micros);
  const decimals = opts?.decimals ?? (Math.abs(dollars) >= 100 ? 0 : 2);
  const sign = opts?.showSign && dollars > 0 ? "+" : "";
  return `${sign}$${dollars.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function fmtCents(cents: number, decimals = 2): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function fmtCredits(credits: number): string {
  return `${credits.toLocaleString("en-US")}`;
}
