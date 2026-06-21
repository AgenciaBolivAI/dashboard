import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { isColdOutreachAttested } from "@/lib/aima/consent";

/**
 * Campaign execution engine (BOLIV Stage 3). Driven by an n8n cron hitting
 * /api/campaigns/tick. Runs the next DUE step of each approved/running campaign
 * — steps fire in seq order, only when scheduled_at <= now and every prior step
 * is done. Runs WITHOUT a user session (bearer-authed tick), so it talks to the
 * DB + webhooks directly rather than the auth-gated server actions.
 *
 * Safety: a campaign only runs when status='approved'/'running' (human
 * approval); status='cancelled' is the kill switch; a budget_credits cap pauses
 * it. spent_credits tracks leads queued for Sandra (the cost-bearing unit) — so
 * a budget doubles as "max leads Sandra will call."
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = { from: (t: string) => any };

type StepRow = {
  id: string;
  campaign_id: string;
  seq: number;
  kind: "aima_scrape" | "sandra_calls" | "report" | "wait";
  params: Record<string, unknown>;
  scheduled_at: string | null;
  status: string;
};
type CampaignRow = {
  id: string;
  tenant_id: string;
  title: string;
  status: string;
  budget_credits: number | null;
  spent_credits: number;
  created_at: string;
};
type StepResult = { ok: boolean; result?: Record<string, unknown>; error?: string; spend?: number };

/** The next runnable step: first pending step whose priors are all done + due. */
function nextActionableStep(steps: StepRow[], nowMs: number): StepRow | "blocked" | null {
  const sorted = [...steps].sort((a, b) => a.seq - b.seq);
  for (const s of sorted) {
    if (s.status === "done" || s.status === "skipped") continue;
    if (s.status === "failed" || s.status === "running") return "blocked";
    // s is the first pending step. Due?
    const due = !s.scheduled_at || new Date(s.scheduled_at).getTime() <= nowMs;
    return due ? s : null; // not due yet → nothing to run this tick
  }
  return null; // all done
}

async function applyAimaFilters(svc: AnyClient, tenantId: string, params: Record<string, unknown>) {
  const patch: Record<string, unknown> = { tenant_id: tenantId, updated_at: new Date().toISOString() };
  if (Array.isArray(params.verticals))
    patch.target_verticals = params.verticals.map(String).map((s) => s.trim().slice(0, 60)).filter(Boolean).slice(0, 20);
  if (Array.isArray(params.geographies))
    patch.target_geographies = params.geographies.map(String).map((s) => s.trim().slice(0, 120)).filter(Boolean).slice(0, 120);
  if (typeof params.max === "number")
    patch.scraper_max_per_run = Math.max(10, Math.min(5000, Math.round(params.max)));
  if (Object.keys(patch).length > 2) {
    await svc.from("aima_settings").upsert(patch, { onConflict: "tenant_id" });
  }
}

async function runStep(
  svc: AnyClient,
  campaign: CampaignRow,
  step: StepRow,
): Promise<StepResult> {
  const tenantId = campaign.tenant_id;
  const p = step.params ?? {};

  if (step.kind === "wait") return { ok: true, result: { waited: true } };

  // Cold-outreach lawful-basis gate: AIMA scraping + Sandra cold calls only run
  // once a tenant admin has attested a lawful basis (schema-step48). Otherwise
  // the step fails with a clear reason (the campaign halts at this step).
  if ((step.kind === "aima_scrape" || step.kind === "sandra_calls") && !(await isColdOutreachAttested(tenantId))) {
    return { ok: false, error: "cold-outreach lawful basis not attested (Marketing → AIMA)" };
  }

  if (step.kind === "aima_scrape") {
    await applyAimaFilters(svc, tenantId, p);
    const url = process.env.AIMA_WEBHOOK_URL;
    const secret = process.env.AIMA_WEBHOOK_SECRET;
    if (!url || !secret) return { ok: false, error: "AIMA webhook not configured" };
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId }),
        signal: AbortSignal.timeout(20_000),
      });
      // n8n often holds the connection; a timeout still means it started.
      return { ok: true, result: { triggered: true, status: res.status } };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("timeout") || msg.includes("aborted")) return { ok: true, result: { triggered: true } };
      return { ok: false, error: msg };
    }
  }

  if (step.kind === "sandra_calls") {
    const status = typeof p.lead_status === "string" ? p.lead_status : "new";
    const source = typeof p.source === "string" ? p.source : undefined;
    const priority = typeof p.priority === "number" ? p.priority : 0;
    let limit = typeof p.limit === "number" ? Math.max(1, Math.min(2000, Math.round(p.limit))) : 500;
    // Budget cap: spent_credits counts queued leads → cap remaining.
    if (campaign.budget_credits != null) {
      const remaining = Math.max(0, campaign.budget_credits - campaign.spent_credits);
      limit = Math.min(limit, remaining);
    }
    if (limit <= 0) return { ok: true, result: { enqueued: 0, note: "budget reached" }, spend: 0 };

    let lq = svc
      .from("leads")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("status", status)
      .neq("status", "do_not_contact")
      .limit(limit);
    if (source) lq = lq.eq("source", source);
    const { data: leadRows } = await lq;
    const candidateIds: string[] = ((leadRows ?? []) as { id: string }[]).map((r) => r.id);
    if (candidateIds.length === 0) return { ok: true, result: { enqueued: 0 }, spend: 0 };

    // Skip leads already queued (pending/calling).
    const { data: queued } = await svc
      .from("sandra_call_queue")
      .select("lead_id")
      .eq("tenant_id", tenantId)
      .in("lead_id", candidateIds)
      .in("status", ["pending", "calling"]);
    const skip = new Set(((queued ?? []) as { lead_id: string | null }[]).map((r) => r.lead_id));
    const toInsert = candidateIds
      .filter((id) => !skip.has(id))
      .map((leadId) => ({ tenant_id: tenantId, lead_id: leadId, priority, status: "pending" }));
    if (toInsert.length === 0) return { ok: true, result: { enqueued: 0 }, spend: 0 };

    const { error } = await svc.from("sandra_call_queue").insert(toInsert);
    if (error) return { ok: false, error: error.message };
    return { ok: true, result: { enqueued: toInsert.length }, spend: toInsert.length };
  }

  if (step.kind === "report") {
    // Snapshot since the campaign was created: new leads + queued/completed calls.
    const since = campaign.created_at;
    const [leadsNew, queuedTotal, callsDone] = await Promise.all([
      svc.from("leads").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", since),
      svc.from("sandra_call_queue").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("queued_at", since),
      svc
        .from("sandra_call_queue")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "done")
        .gte("queued_at", since),
    ]);
    const nLeads = leadsNew.count ?? 0;
    const nQueued = queuedTotal.count ?? 0;
    const nDone = callsDone.count ?? 0;
    const body =
      typeof p.about === "string" && p.about
        ? `${p.about} — ${nLeads} leads nuevos, ${nQueued} en cola de Sandra (${nDone} llamadas completadas).`
        : `${nLeads} leads nuevos, ${nQueued} en cola de Sandra (${nDone} llamadas completadas) desde el inicio de la campaña.`;
    const { data: rec } = await svc
      .from("ai_recommendations")
      .insert({
        tenant_id: tenantId,
        kind: "insight",
        title: `Campaña: ${campaign.title}`,
        body,
        source: "boliv",
        status: "new",
      })
      .select("id")
      .single();
    return { ok: true, result: { recommendation_id: (rec as { id?: string } | null)?.id ?? null, leads: nLeads, queued: nQueued } };
  }

  return { ok: false, error: `unknown step kind: ${step.kind}` };
}

export type TickSummary = { campaigns: number; ranSteps: number; details: unknown[] };

/** Run one tick: advance every eligible campaign by (at most) one due step. */
export async function runCampaignTick(opts: { tenantId?: string } = {}): Promise<TickSummary> {
  const svc = createServiceClient() as unknown as AnyClient;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  let cq = svc
    .from("campaigns")
    .select("id, tenant_id, title, status, budget_credits, spent_credits, created_at")
    .in("status", ["approved", "running"]);
  if (opts.tenantId) cq = cq.eq("tenant_id", opts.tenantId);
  const { data: camps } = await cq;
  const campaigns = (camps ?? []) as CampaignRow[];

  const details: unknown[] = [];
  let ranSteps = 0;

  for (const c of campaigns) {
    const { data: stepData } = await svc
      .from("campaign_steps")
      .select("id, campaign_id, seq, kind, params, scheduled_at, status")
      .eq("campaign_id", c.id)
      .order("seq", { ascending: true });
    const steps = (stepData ?? []) as StepRow[];

    const next = nextActionableStep(steps, nowMs);
    if (next === "blocked") {
      // A prior step failed (or is wedged) — surface it by pausing.
      await svc.from("campaigns").update({ status: "paused" }).eq("id", c.id);
      details.push({ campaign: c.id, blocked: true });
      continue;
    }
    if (!next) {
      // No runnable step. If everything is finished, close the campaign.
      if (steps.length > 0 && steps.every((s) => s.status === "done" || s.status === "skipped")) {
        await svc.from("campaigns").update({ status: "done" }).eq("id", c.id);
        details.push({ campaign: c.id, done: true });
      }
      continue;
    }

    // Budget gate.
    if (c.budget_credits != null && c.spent_credits >= c.budget_credits) {
      await svc.from("campaigns").update({ status: "paused" }).eq("id", c.id);
      details.push({ campaign: c.id, paused: "budget" });
      continue;
    }

    // Mark the campaign running on its first executed step.
    if (c.status === "approved") await svc.from("campaigns").update({ status: "running" }).eq("id", c.id);
    await svc.from("campaign_steps").update({ status: "running", started_at: nowIso }).eq("id", next.id);

    const res = await runStep(svc, c, next);
    await svc
      .from("campaign_steps")
      .update({
        status: res.ok ? "done" : "failed",
        result: res.result ?? (res.error ? { error: res.error } : {}),
        completed_at: nowIso,
      })
      .eq("id", next.id);
    if (res.spend) {
      await svc.from("campaigns").update({ spent_credits: c.spent_credits + res.spend }).eq("id", c.id);
    }
    ranSteps++;
    details.push({ campaign: c.id, step: next.kind, ok: res.ok, result: res.result ?? null });

    // If that was the last step, close the campaign.
    const remaining = steps.filter((s) => s.id !== next.id && s.status !== "done" && s.status !== "skipped");
    if (res.ok && remaining.length === 0) {
      await svc.from("campaigns").update({ status: "done" }).eq("id", c.id);
    }
  }

  return { campaigns: campaigns.length, ranSteps, details };
}
