import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { getBalanceWithService } from "@/lib/billing/credits";
import { runProspectResearch, type SubjectKind } from "./research";

/**
 * Auto-research execution engine. Driven by an n8n cron hitting /api/research/tick
 * (~3 min). Each tick processes a bounded batch of QUEUED prospect_research rows
 * (enqueued by the inbound lead hooks), running the web-search research per row.
 *
 * Cost controls (this account is cost-conscious):
 *  - Per-tenant DAILY CAP (prospect_settings.daily_cap, default 25) counted from
 *    rows completed today — a flood of inbound leads can't drain credits.
 *  - Balance gate per tenant: if the tenant can't afford the next research, its
 *    rows are LEFT queued (not failed) so a top-up resumes exactly where it stopped.
 *  - auto_research_enabled off → the tenant's queue is skipped (left queued).
 *
 * Crash safety: a row claimed (queued→running) by a tick that then crashes/times
 * out is reclaimed next tick (running rows older than RECLAIM_AFTER_MS). The 5-min
 * threshold is wider than an on-demand run (≤55s) so it never clobbers an in-flight
 * on-demand research. Each row is claimed atomically (UPDATE … WHERE status='queued'
 * RETURNING) so two ticks never research the same row.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient & { from: (t: string) => any };

const GLOBAL_PER_TICK = 12; // search model ~2–4s each → stays well inside 60s
const PER_TENANT_PER_TICK = 6;
const DEFAULT_DAILY_CAP = 25;
const RECLAIM_AFTER_MS = 5 * 60 * 1000;

export type ResearchTickSummary = { tenants: number; done: number; failed: number };

type QueuedRow = { tenant_id: string; subject_kind: SubjectKind; subject_id: string };

function startOfUtcDayIso(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export async function runResearchTick(opts: { tenantId?: string } = {}): Promise<ResearchTickSummary> {
  const svc = createServiceClient() as unknown as AnyClient;

  // Crash recovery: reclaim rows stranded 'running' by a prior crashed/timed-out
  // tick (older than RECLAIM_AFTER_MS — never an in-flight on-demand run).
  {
    const cutoff = new Date(Date.now() - RECLAIM_AFTER_MS).toISOString();
    let rq = svc
      .from("prospect_research")
      .update({ status: "queued" })
      .eq("status", "running")
      .lt("updated_at", cutoff);
    if (opts.tenantId) rq = rq.eq("tenant_id", opts.tenantId);
    await rq;
  }

  // Which tenants have queued work?
  let qq = svc.from("prospect_research").select("tenant_id").eq("status", "queued");
  if (opts.tenantId) qq = qq.eq("tenant_id", opts.tenantId);
  const { data: qrows } = await qq;
  const tenantIds = Array.from(new Set(((qrows ?? []) as Array<{ tenant_id: string }>).map((r) => r.tenant_id)));

  let done = 0;
  let failed = 0;
  let touchedTenants = 0;
  let globalRemaining = GLOBAL_PER_TICK;
  const dayStart = startOfUtcDayIso();

  for (const tenantId of tenantIds) {
    if (globalRemaining <= 0) break;

    // Settings (default ON, default cap). A missing row → defaults.
    const { data: ps } = await svc
      .from("prospect_settings")
      .select("auto_research_enabled, daily_cap")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const settings = ps as { auto_research_enabled?: boolean; daily_cap?: number } | null;
    if (settings && settings.auto_research_enabled === false) continue; // queue stays for later
    const dailyCap = settings?.daily_cap ?? DEFAULT_DAILY_CAP;

    // Daily cap: count rows already completed today for this tenant.
    const { count: doneToday } = await svc
      .from("prospect_research")
      .select("subject_id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "done")
      .gte("generated_at", dayStart);
    const remainingCap = Math.max(0, dailyCap - (doneToday ?? 0));
    if (remainingCap <= 0) continue;

    // Balance gate — leave the queue intact if they can't afford it (top-up resumes).
    const bal = await getBalanceWithService(tenantId);
    if (!bal || bal.available_credits <= 0) continue;

    const batchSize = Math.min(PER_TENANT_PER_TICK, remainingCap, globalRemaining);
    const { data: rows } = await svc
      .from("prospect_research")
      .select("tenant_id, subject_kind, subject_id")
      .eq("tenant_id", tenantId)
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(batchSize);
    const queued = (rows ?? []) as QueuedRow[];
    if (queued.length === 0) continue;
    touchedTenants += 1;

    for (const r of queued) {
      if (globalRemaining <= 0) break;

      // Atomic claim — only the tick that flips queued→running researches this row.
      const claim = await svc
        .from("prospect_research")
        .update({ status: "running" })
        .eq("tenant_id", r.tenant_id)
        .eq("subject_kind", r.subject_kind)
        .eq("subject_id", r.subject_id)
        .eq("status", "queued")
        .select("subject_id");
      if (((claim.data ?? []) as unknown[]).length === 0) continue; // lost the claim

      globalRemaining -= 1;
      const res = await runProspectResearch(r.tenant_id, r.subject_kind, r.subject_id, null);
      if (res.ok) done += 1;
      else failed += 1;

      // Out of credits mid-batch → stop this tenant (remaining stay queued/failed).
      if (!res.ok && res.error === "insufficient_credits") break;
    }
  }

  return { tenants: touchedTenants, done, failed };
}
