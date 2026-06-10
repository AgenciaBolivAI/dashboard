import { createServiceClient } from "@/lib/supabase/service";

export type PricingRow = {
  action_key: string;
  credits_per_unit: number;
  unit_label: string;
  description: string | null;
  cost_per_unit_micros: number;
  vendor_cost_micros: Record<string, number>;
  updated_at: string;
  // computed
  revenue_micros: number;       // credits_per_unit * 10_000
  margin_micros: number;
  margin_pct: number | null;
  vendor_sum_micros: number;    // for "vendor breakdown doesn't add up to cost" warning
  vendor_sum_matches: boolean;
};

export async function listCreditPricing(): Promise<PricingRow[]> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("credit_pricing")
    .select(
      "action_key, credits_per_unit, unit_label, description, cost_per_unit_micros, vendor_cost_micros, updated_at",
    )
    .order("action_key");

  type RawRow = {
    action_key: string;
    credits_per_unit: number;
    unit_label: string;
    description: string | null;
    cost_per_unit_micros: number;
    vendor_cost_micros: unknown;
    updated_at: string;
  };

  return ((data ?? []) as RawRow[]).map((r) => {
    const vendorMap =
      r.vendor_cost_micros && typeof r.vendor_cost_micros === "object" && !Array.isArray(r.vendor_cost_micros)
        ? (r.vendor_cost_micros as Record<string, number | string>)
        : {};
    const vendorCost: Record<string, number> = {};
    for (const [k, v] of Object.entries(vendorMap)) {
      vendorCost[k] = typeof v === "number" ? v : Number(v) || 0;
    }
    const vendorSum = Object.values(vendorCost).reduce((s, n) => s + n, 0);
    const revenueMicros = r.credits_per_unit * 10_000;
    const marginMicros = revenueMicros - r.cost_per_unit_micros;
    const marginPct =
      revenueMicros > 0 ? Math.round((marginMicros / revenueMicros) * 1000) / 10 : null;
    return {
      action_key: r.action_key,
      credits_per_unit: r.credits_per_unit,
      unit_label: r.unit_label,
      description: r.description,
      cost_per_unit_micros: r.cost_per_unit_micros,
      vendor_cost_micros: vendorCost,
      updated_at: r.updated_at,
      revenue_micros: revenueMicros,
      margin_micros: marginMicros,
      margin_pct: marginPct,
      vendor_sum_micros: vendorSum,
      vendor_sum_matches: vendorSum === 0 || vendorSum === r.cost_per_unit_micros,
    };
  });
}

export function fmtMicros(micros: number, decimals = 4): string {
  return `$${(micros / 1_000_000).toFixed(decimals)}`;
}
export function fmtCredits(credits: number): string {
  return `${credits} cr`;
}
export function creditsToUsd(credits: number): string {
  return `$${(credits / 100).toFixed(2)}`;
}
