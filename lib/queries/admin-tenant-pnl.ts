import { createServiceClient } from "@/lib/supabase/service";
import type { ActionBreakdown, DailyTimeseriesPoint } from "./admin-pnl";

export type TenantActionBreakdown = ActionBreakdown;

export type TenantTopup = {
  created_at: string;
  paid_cents: number;
  base_credits: number;
  bonus_credits: number;
  balance_after: number;
  stripe_pi_id: string | null;
};

export type TenantRecentTx = {
  id: string;
  created_at: string;
  type: string;
  credits_delta: number;
  balance_after: number;
  action_key: string | null;
  reference_id: string | null;
};

/** Per-tenant action breakdown over a window. Mirrors platform_action_breakdown but scoped. */
export async function getTenantActionBreakdown(
  tenantId: string,
  window: "today" | "7d" | "month" | "30d" | "90d" | "all" = "30d",
): Promise<TenantActionBreakdown[]> {
  const svc = createServiceClient();
  // No dedicated RPC — compute by joining credit_transactions × credit_pricing
  // for this tenant. Inline SQL via raw select since supabase-js can't express
  // the GROUP BY + JOIN we need.
  const startTs = windowStart(window);
  const { data } = await svc
    .from("credit_transactions")
    .select("action_key, credits_delta")
    .eq("tenant_id", tenantId)
    .in("type", ["usage", "release"])
    .gte("created_at", startTs)
    .not("action_key", "is", null);

  // Group in-app since we can't aggregate via PostgREST without RPC
  type AggBucket = { units: number; revenue_credits: number };
  const byKey = new Map<string, AggBucket>();
  for (const row of (data ?? []) as { action_key: string | null; credits_delta: number }[]) {
    if (!row.action_key) continue;
    const k = row.action_key;
    const entry = byKey.get(k) ?? { units: 0, revenue_credits: 0 };
    entry.revenue_credits += -row.credits_delta;
    byKey.set(k, entry);
  }

  if (byKey.size === 0) return [];

  // Join with pricing for unit + cost calculation
  const { data: pricingRows } = await svc
    .from("credit_pricing")
    .select("action_key, credits_per_unit, cost_per_unit_micros")
    .in("action_key", [...byKey.keys()]);

  const pricing = new Map<string, { credits_per_unit: number; cost_per_unit_micros: number }>();
  for (const p of (pricingRows ?? []) as Array<{
    action_key: string;
    credits_per_unit: number;
    cost_per_unit_micros: number;
  }>) {
    pricing.set(p.action_key, p);
  }

  const out: TenantActionBreakdown[] = [];
  for (const [action_key, agg] of byKey.entries()) {
    const p = pricing.get(action_key);
    const credits_per_unit = p?.credits_per_unit ?? 1;
    const cost_per_unit_micros = p?.cost_per_unit_micros ?? 0;
    const units = Math.round(agg.revenue_credits / credits_per_unit);
    const cost_micros = units * cost_per_unit_micros;
    const revenue_micros = agg.revenue_credits * 10000;
    const margin_micros = revenue_micros - cost_micros;
    const margin_pct = revenue_micros > 0 ? Math.round((margin_micros / revenue_micros) * 1000) / 10 : null;
    out.push({
      action_key,
      units,
      revenue_credits: agg.revenue_credits,
      cost_micros,
      margin_micros,
      margin_pct,
      unique_tenants: 1,
    });
  }
  out.sort((a, b) => b.margin_micros - a.margin_micros);
  return out;
}

/** Recent transactions (any type) for the tenant. */
export async function getTenantRecentTransactions(
  tenantId: string,
  limit = 30,
): Promise<TenantRecentTx[]> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("credit_transactions")
    .select("id, created_at, type, credits_delta, balance_after, action_key, reference_id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as TenantRecentTx[];
}

/** Top-up history (paid_cents/base/bonus extracted from metadata). */
export async function getTenantTopups(
  tenantId: string,
  limit = 20,
): Promise<TenantTopup[]> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("credit_transactions")
    .select("created_at, credits_delta, balance_after, reference_id, metadata")
    .eq("tenant_id", tenantId)
    .eq("type", "top_up")
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as Array<{
    created_at: string;
    credits_delta: number;
    balance_after: number;
    reference_id: string | null;
    metadata: Record<string, unknown>;
  }>).map((r) => {
    const meta = r.metadata ?? {};
    return {
      created_at: r.created_at,
      paid_cents:
        typeof meta.paid_cents === "number"
          ? meta.paid_cents
          : Number(meta.paid_cents) || 0,
      base_credits:
        typeof meta.base_credits === "number"
          ? meta.base_credits
          : Number(meta.base_credits) || r.credits_delta,
      bonus_credits:
        typeof meta.bonus_credits === "number"
          ? meta.bonus_credits
          : Number(meta.bonus_credits) || 0,
      balance_after: r.balance_after,
      stripe_pi_id: r.reference_id,
    };
  });
}

/** Day-by-day spend (usage credits) for the tenant — for a sparkline. */
export async function getTenantDailyTimeseries(
  tenantId: string,
  days = 30,
): Promise<DailyTimeseriesPoint[]> {
  const svc = createServiceClient();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (days - 1));
  start.setUTCHours(0, 0, 0, 0);
  const { data } = await svc
    .from("credit_transactions")
    .select("created_at, type, credits_delta, action_key")
    .eq("tenant_id", tenantId)
    .gte("created_at", start.toISOString());

  // Day-bucket the rows
  const byDay = new Map<string, { revenue_cents: number; usage_credits: number; action_keys: Map<string, number> }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const k = d.toISOString().slice(0, 10);
    byDay.set(k, { revenue_cents: 0, usage_credits: 0, action_keys: new Map() });
  }

  for (const row of (data ?? []) as Array<{
    created_at: string;
    type: string;
    credits_delta: number;
    action_key: string | null;
  }>) {
    const day = row.created_at.slice(0, 10);
    const bucket = byDay.get(day);
    if (!bucket) continue;
    if (row.type === "top_up") {
      bucket.revenue_cents += row.credits_delta;
    } else if (row.type === "usage" || row.type === "release") {
      bucket.usage_credits += -row.credits_delta;
      if (row.action_key) {
        const cur = bucket.action_keys.get(row.action_key) ?? 0;
        bucket.action_keys.set(row.action_key, cur + -row.credits_delta);
      }
    }
  }

  // Pull pricing once to compute cost
  const allKeys = new Set<string>();
  for (const b of byDay.values()) for (const k of b.action_keys.keys()) allKeys.add(k);
  let pricing = new Map<string, { credits_per_unit: number; cost_per_unit_micros: number }>();
  if (allKeys.size > 0) {
    const { data: priceRows } = await svc
      .from("credit_pricing")
      .select("action_key, credits_per_unit, cost_per_unit_micros")
      .in("action_key", [...allKeys]);
    pricing = new Map(
      ((priceRows ?? []) as Array<{
        action_key: string;
        credits_per_unit: number;
        cost_per_unit_micros: number;
      }>).map((r) => [r.action_key, r]),
    );
  }

  const points: DailyTimeseriesPoint[] = [];
  for (const [day, bucket] of byDay.entries()) {
    let cost_micros = 0;
    for (const [k, credits] of bucket.action_keys.entries()) {
      const p = pricing.get(k);
      if (!p || p.credits_per_unit <= 0) continue;
      const units = credits / p.credits_per_unit;
      cost_micros += units * p.cost_per_unit_micros;
    }
    points.push({
      day,
      revenue_cents: bucket.revenue_cents,
      usage_credits: bucket.usage_credits,
      cost_micros,
      margin_micros: bucket.usage_credits * 10000 - cost_micros,
    });
  }
  return points;
}

function windowStart(window: "today" | "7d" | "month" | "30d" | "90d" | "all"): string {
  const now = new Date();
  if (window === "today") {
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (window === "month") {
    const d = new Date(now);
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (window === "all") return "1970-01-01T00:00:00Z";
  const days = window === "7d" ? 7 : window === "30d" ? 30 : 90;
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}
