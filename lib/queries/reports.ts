import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { STAGE_WIN_PROBABILITY, isOpenStage, type LeadStatus } from "@/lib/leads-types";

/**
 * Sales reports: funnel, conversion, pipeline value + weighted forecast, and a
 * revenue trend. Tenant-scoped (RLS via the server client; the page also gates
 * with requireTenantAccess). Numbers are computed in JS from bounded fetches —
 * no RPC — mirroring lib/queries/overview.ts.
 */

export type ReportPeriod = "7d" | "30d" | "90d" | "all";
export const REPORT_PERIODS: ReportPeriod[] = ["7d", "30d", "90d", "all"];

function periodStartIso(p: ReportPeriod): string | null {
  if (p === "all") return null;
  const days = p === "7d" ? 7 : p === "30d" ? 30 : 90;
  return new Date(Date.now() - days * 86400_000).toISOString();
}

/** The conversion funnel order (open → won). */
const FUNNEL_ORDER: LeadStatus[] = ["new", "contacted", "warm", "converted"];

export type ReportData = {
  period: ReportPeriod;
  currency: string;
  totalLeads: number;
  funnel: { status: LeadStatus; count: number; pct: number }[];
  conversionRatePct: number | null;
  wonValueCents: number;
  openPipelineCents: number;
  weightedForecastCents: number;
  pipelineByStage: { status: LeadStatus; count: number; value_cents: number }[];
  revenueTrend: { day: string; count: number }[];
  revenueTotalCents: number;
};

export async function getReports(
  tenantId: string,
  period: ReportPeriod,
  currency: string,
): Promise<ReportData> {
  const supabase = await createClient();
  const startIso = periodStartIso(period);

  // ── Leads created in the period (funnel + conversion + won) ──────────
  let leadsQ = supabase
    .from("leads")
    .select("status, value_cents, created_at")
    .eq("tenant_id", tenantId);
  if (startIso) leadsQ = leadsQ.gte("created_at", startIso);
  const { data: periodLeads } = await leadsQ.limit(50_000);
  const pl = (periodLeads ?? []) as { status: string; value_cents: number | null }[];

  const totalLeads = pl.length;
  const countByStatus = new Map<string, number>();
  let wonValueCents = 0;
  for (const l of pl) {
    countByStatus.set(l.status, (countByStatus.get(l.status) ?? 0) + 1);
    if (l.status === "converted") wonValueCents += l.value_cents ?? 0;
  }
  const convertedCount = countByStatus.get("converted") ?? 0;
  const funnel = FUNNEL_ORDER.map((status) => {
    const count = countByStatus.get(status) ?? 0;
    return { status, count, pct: totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0 };
  });
  const conversionRatePct = totalLeads > 0 ? Math.round((convertedCount / totalLeads) * 1000) / 10 : null;

  // ── Current OPEN pipeline snapshot (value by stage + weighted forecast) ─
  const { data: openLeads } = await supabase
    .from("leads")
    .select("status, value_cents")
    .eq("tenant_id", tenantId)
    .in("status", ["new", "contacted", "warm"])
    .limit(50_000);
  const ol = (openLeads ?? []) as { status: string; value_cents: number | null }[];

  const stageMap = new Map<LeadStatus, { count: number; value_cents: number }>();
  for (const s of ["new", "contacted", "warm"] as LeadStatus[]) stageMap.set(s, { count: 0, value_cents: 0 });
  let openPipelineCents = 0;
  let weightedForecastCents = 0;
  for (const l of ol) {
    const v = l.value_cents ?? 0;
    const e = stageMap.get(l.status as LeadStatus);
    if (e) {
      e.count += 1;
      e.value_cents += v;
    }
    openPipelineCents += v;
    if (isOpenStage(l.status)) weightedForecastCents += v * (STAGE_WIN_PROBABILITY[l.status as LeadStatus] ?? 0);
  }
  const pipelineByStage = (["new", "contacted", "warm"] as LeadStatus[]).map((status) => ({
    status,
    count: stageMap.get(status)?.count ?? 0,
    value_cents: stageMap.get(status)?.value_cents ?? 0,
  }));

  // ── Revenue trend (paid invoices in period, by day, tenant currency) ──
  let invQ = supabase
    .from("invoices")
    .select("amount_paid_cents, paid_at")
    .eq("tenant_id", tenantId)
    .eq("currency", currency)
    .eq("status", "paid")
    .not("paid_at", "is", null);
  if (startIso) invQ = invQ.gte("paid_at", startIso);
  const { data: paid } = await invQ.limit(50_000);
  const byDay = new Map<string, number>();
  let revenueTotalCents = 0;
  for (const r of (paid ?? []) as { amount_paid_cents: number | null; paid_at: string }[]) {
    const day = r.paid_at.slice(0, 10);
    const cents = r.amount_paid_cents ?? 0;
    byDay.set(day, (byDay.get(day) ?? 0) + cents);
    revenueTotalCents += cents;
  }
  const revenueTrend = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, cents]) => ({ day, count: Math.round(cents / 100) }));

  return {
    period,
    currency,
    totalLeads,
    funnel,
    conversionRatePct,
    wonValueCents,
    openPipelineCents,
    weightedForecastCents,
    pipelineByStage,
    revenueTrend,
    revenueTotalCents,
  };
}

// ─── Sentiment & at-risk report (BOLIV conversation analysis) ──────────────
export type SentimentReport = {
  total: number;
  distribution: { positive: number; neutral: number; negative: number };
  atRisk: Array<{
    conversationId: string;
    name: string | null;
    channel: string | null;
    sentiment: "positive" | "neutral" | "negative";
    summary: string | null;
    nextAction: string | null;
    generatedAt: string | null;
  }>;
};

/**
 * Aggregates BOLIV's conversation sentiment over the period: a positive/neutral/
 * negative distribution + the open at-risk conversations (negative OR flagged
 * at_risk) so the owner can act. Tenant-scoped via RLS (member select policy on
 * conversation_analysis); the page also gates with requirePermission.
 */
export async function getSentimentReport(
  tenantId: string,
  period: ReportPeriod,
): Promise<SentimentReport> {
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const startIso = periodStartIso(period);

  let q = supabase
    .from("conversation_analysis")
    .select("conversation_id, sentiment, summary, signals, generated_at")
    .eq("tenant_id", tenantId)
    .eq("status", "done");
  if (startIso) q = q.gte("generated_at", startIso);
  const { data } = await q.order("generated_at", { ascending: false }).limit(5_000);
  const rows = (data ?? []) as Array<{
    conversation_id: string;
    sentiment: "positive" | "neutral" | "negative" | null;
    summary: string | null;
    signals: { at_risk?: boolean; next_best_action?: string } | null;
    generated_at: string | null;
  }>;

  const distribution = { positive: 0, neutral: 0, negative: 0 };
  const atRiskRows: typeof rows = [];
  for (const r of rows) {
    if (r.sentiment) distribution[r.sentiment] += 1;
    if (r.sentiment === "negative" || r.signals?.at_risk) atRiskRows.push(r);
  }

  // Resolve customer name + channel for the at-risk conversations (top 20).
  const top = atRiskRows.slice(0, 20);
  const nameByConvo = new Map<string, { name: string | null; channel: string | null }>();
  if (top.length > 0) {
    const ids = top.map((r) => r.conversation_id);
    const { data: convos } = await supabase
      .from("conversations")
      .select("id, channel, users:user_id ( name )")
      .eq("tenant_id", tenantId)
      .in("id", ids);
    for (const c of (convos ?? []) as Array<{ id: string; channel: string | null; users: { name: string | null } | { name: string | null }[] | null }>) {
      const u = Array.isArray(c.users) ? c.users[0] : c.users;
      nameByConvo.set(c.id, { name: u?.name ?? null, channel: c.channel });
    }
  }

  return {
    total: rows.length,
    distribution,
    atRisk: top.map((r) => ({
      conversationId: r.conversation_id,
      name: nameByConvo.get(r.conversation_id)?.name ?? null,
      channel: nameByConvo.get(r.conversation_id)?.channel ?? null,
      sentiment: (r.sentiment ?? "neutral") as "positive" | "neutral" | "negative",
      summary: r.summary,
      nextAction: r.signals?.next_best_action ?? null,
      generatedAt: r.generated_at,
    })),
  };
}
