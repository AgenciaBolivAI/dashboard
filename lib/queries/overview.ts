import { createClient } from "@/lib/supabase/server";

/**
 * Analytics for the tenant Overview dashboard. Tenant-scoped via the RLS server
 * client + an explicit `tenant_id` filter (the page only ever passes the
 * authenticated tenant's id, guarded by the dashboard layout). Follows the
 * codebase convention of fetching a window of rows and bucketing by day in JS
 * (same as getTenantDailyTimeseries) — no extra RPC/migration needed.
 */

export type OverviewPeriod = "today" | "7d" | "30d" | "90d";
export const OVERVIEW_PERIODS: OverviewPeriod[] = ["today", "7d", "30d", "90d"];
const PERIOD_DAYS: Record<OverviewPeriod, number> = { today: 1, "7d": 7, "30d": 30, "90d": 90 };

export type Kpi = { current: number; prior: number; deltaPct: number | null; spark: number[] };
export type ChannelSlice = { channel: string; count: number };
export type WorkforceRow = { key: string; count: number; detail: number | null };
export type DayPoint = { day: string; count: number };

export type OverviewAnalytics = {
  days: number;
  kpis: { conversations: Kpi; leads: Kpi; bookings: Kpi; revenueCents: Kpi };
  messages: { current: number; prior: number; deltaPct: number | null };
  voiceMinutes: number;
  conversationSeries: DayPoint[];
  channelMix: ChannelSlice[];
  workforce: WorkforceRow[];
};

function deltaPct(cur: number, prior: number): number | null {
  if (prior === 0) return cur > 0 ? 100 : null;
  return Math.round(((cur - prior) / prior) * 1000) / 10;
}

/** Calendar-day keys [start … start+days-1] in UTC, as YYYY-MM-DD. */
function dayKeys(start: Date, days: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function bucketByDay(timestamps: string[], keys: string[]): number[] {
  const idx = new Map(keys.map((k, i) => [k, i]));
  const counts = new Array(keys.length).fill(0) as number[];
  for (const ts of timestamps) {
    const i = idx.get(ts.slice(0, 10));
    if (i !== undefined) counts[i]++;
  }
  return counts;
}

export async function getOverviewAnalytics(
  tenantId: string,
  period: OverviewPeriod,
): Promise<OverviewAnalytics> {
  const supabase = await createClient();
  const days = PERIOD_DAYS[period];

  const curStart = new Date();
  curStart.setUTCHours(0, 0, 0, 0);
  curStart.setUTCDate(curStart.getUTCDate() - (days - 1));
  const priorStart = new Date(curStart);
  priorStart.setUTCDate(priorStart.getUTCDate() - days);
  const curISO = curStart.toISOString();
  const priorISO = priorStart.toISOString();
  const keys = dayKeys(curStart, days);

  const scope = <T,>(q: T) => (q as { eq: (c: string, v: string) => T }).eq("tenant_id", tenantId);

  const [
    convRows,
    convPrior,
    leadRows,
    leadPrior,
    bookRows,
    bookPrior,
    invRows,
    msgCur,
    msgPrior,
    voiceRows,
    ccavaiCur,
  ] = await Promise.all([
    // conversations in current window (created_at + channel → count, series, mix)
    scope(supabase.from("conversations").select("created_at, channel")).gte("created_at", curISO),
    scope(supabase.from("conversations").select("id", { count: "exact", head: true }))
      .gte("created_at", priorISO)
      .lt("created_at", curISO),
    // leads
    scope(supabase.from("leads").select("created_at")).gte("created_at", curISO),
    scope(supabase.from("leads").select("id", { count: "exact", head: true }))
      .gte("created_at", priorISO)
      .lt("created_at", curISO),
    // bookings = confirmed reservations created in window
    scope(supabase.from("reservations").select("created_at"))
      .eq("status", "confirmed")
      .gte("created_at", curISO),
    scope(supabase.from("reservations").select("id", { count: "exact", head: true }))
      .eq("status", "confirmed")
      .gte("created_at", priorISO)
      .lt("created_at", curISO),
    // paid invoices across both windows (split by paid_at in JS)
    scope(supabase.from("invoices").select("paid_at, amount_paid_cents"))
      .not("paid_at", "is", null)
      .gte("paid_at", priorISO),
    // messages handled (chat_history) — counts only
    scope(supabase.from("chat_history").select("id", { count: "exact", head: true })).gte("created_at", curISO),
    scope(supabase.from("chat_history").select("id", { count: "exact", head: true }))
      .gte("created_at", priorISO)
      .lt("created_at", curISO),
    // voice calls in window (direction + duration)
    scope(supabase.from("voice_conversations").select("direction, duration_seconds")).gte("started_at", curISO),
    // CCAVAI drafts generated in window
    scope(supabase.from("ccavai_drafts").select("id", { count: "exact", head: true })).gte("generated_at", curISO),
  ]);

  // ── conversations ──
  const conv = (convRows.data ?? []) as { created_at: string; channel: string | null }[];
  const convSpark = bucketByDay(conv.map((r) => r.created_at), keys);
  const conversationSeries: DayPoint[] = keys.map((day, i) => ({ day, count: convSpark[i]! }));
  const mixMap = new Map<string, number>();
  for (const r of conv) {
    const ch = r.channel ?? "whatsapp";
    mixMap.set(ch, (mixMap.get(ch) ?? 0) + 1);
  }
  const channelMix: ChannelSlice[] = [...mixMap.entries()]
    .map(([channel, count]) => ({ channel, count }))
    .sort((a, b) => b.count - a.count);

  // ── leads ──
  const leads = (leadRows.data ?? []) as { created_at: string }[];
  const leadSpark = bucketByDay(leads.map((r) => r.created_at), keys);

  // ── bookings ──
  const books = (bookRows.data ?? []) as { created_at: string }[];
  const bookSpark = bucketByDay(books.map((r) => r.created_at), keys);

  // ── revenue (paid invoices) ──
  const inv = (invRows.data ?? []) as { paid_at: string; amount_paid_cents: number | null }[];
  let revCur = 0;
  let revPrior = 0;
  const revByDay = new Map(keys.map((k) => [k, 0]));
  for (const r of inv) {
    const cents = r.amount_paid_cents ?? 0;
    if (r.paid_at >= curISO) {
      revCur += cents;
      const k = r.paid_at.slice(0, 10);
      if (revByDay.has(k)) revByDay.set(k, revByDay.get(k)! + cents);
    } else {
      revPrior += cents;
    }
  }
  const revSpark = keys.map((k) => revByDay.get(k) ?? 0);

  // ── voice ──
  const voice = (voiceRows.data ?? []) as { direction: string | null; duration_seconds: number | null }[];
  const voiceMinutes = Math.round(voice.reduce((s, v) => s + (v.duration_seconds ?? 0), 0) / 60);
  const voiceOutbound = voice.filter((v) => v.direction === "outbound").length;
  const voiceInbound = voice.filter((v) => v.direction === "inbound").length;

  const convCount = conv.length;
  const leadCount = leads.length;
  const bookCount = books.length;

  return {
    days,
    kpis: {
      conversations: kpi(convCount, convPrior.count ?? 0, convSpark),
      leads: kpi(leadCount, leadPrior.count ?? 0, leadSpark),
      bookings: kpi(bookCount, bookPrior.count ?? 0, bookSpark),
      revenueCents: kpi(revCur, revPrior, revSpark),
    },
    messages: {
      current: msgCur.count ?? 0,
      prior: msgPrior.count ?? 0,
      deltaPct: deltaPct(msgCur.count ?? 0, msgPrior.count ?? 0),
    },
    voiceMinutes,
    conversationSeries,
    channelMix,
    workforce: [
      { key: "whatsapp", count: mixMap.get("whatsapp") ?? 0, detail: null },
      { key: "instagram", count: mixMap.get("instagram") ?? 0, detail: null },
      { key: "messenger", count: mixMap.get("facebook_messenger") ?? 0, detail: null },
      { key: "sandra", count: voiceOutbound, detail: voiceMinutes },
      { key: "rebecca", count: voiceInbound, detail: null },
      { key: "aima", count: leadCount, detail: null },
      { key: "ccavai", count: ccavaiCur.count ?? 0, detail: null },
    ],
  };
}

function kpi(current: number, prior: number, spark: number[]): Kpi {
  return { current, prior, deltaPct: deltaPct(current, prior), spark };
}
