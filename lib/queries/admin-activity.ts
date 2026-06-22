import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import type { AreaPoint } from "@/components/charts/area-trend";

/**
 * Platform activity metrics for the admin overview. Computes DAU/WAU/MAU and a
 * daily-active-users timeseries from the user_activity rollup table (one row
 * per user per UTC day). Distinct-user counts are bucketed in JS — the table is
 * small (one row per active user per day) so a single 30-day fetch is cheap and
 * avoids a custom SQL RPC. All day math is UTC to match the write side
 * (lib/activity.ts), so no timezone drift.
 */
export type ActivityStats = {
  dau: number;
  wau: number;
  mau: number;
  total: number;
  series: AreaPoint[]; // daily active-user count, oldest → newest
};

/** UTC YYYY-MM-DD `offset` days from today (offset is negative for the past). */
function utcDay(offset = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

export async function getActivityStats(days = 30): Promise<ActivityStats> {
  // user_activity isn't in the generated DB types yet — loosely-typed client.
  const svc = createServiceClient() as unknown as SupabaseClient;
  const span = Math.max(days, 30); // always fetch ≥30d so MAU is correct
  const since = utcDay(-(span - 1));
  const today = utcDay(0);
  const weekAgo = utcDay(-6);
  const monthAgo = utcDay(-29);

  const [actRes, duRes] = await Promise.all([
    svc.from("user_activity").select("user_id, day").gte("day", since),
    svc.from("dashboard_users").select("user_id"),
  ]);

  const rows = (actRes.data ?? []) as { user_id: string; day: string }[];
  const dau = new Set(rows.filter((r) => r.day === today).map((r) => r.user_id)).size;
  const wau = new Set(rows.filter((r) => r.day >= weekAgo).map((r) => r.user_id)).size;
  const mau = new Set(rows.filter((r) => r.day >= monthAgo).map((r) => r.user_id)).size;

  const total = new Set(
    ((duRes.data ?? []) as { user_id: string }[]).map((r) => r.user_id),
  ).size;

  // Distinct users per day → ordered series for the chart.
  const byDay = new Map<string, Set<string>>();
  for (const r of rows) {
    let set = byDay.get(r.day);
    if (!set) byDay.set(r.day, (set = new Set()));
    set.add(r.user_id);
  }
  const series: AreaPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = utcDay(-i);
    series.push({ day, count: byDay.get(day)?.size ?? 0 });
  }

  return { dau, wau, mau, total, series };
}
