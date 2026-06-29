import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { sendOnChannel, resolveEvolutionInstance, type MarketingChannel, type UnsubscribeCtx } from "./channels";
import { getBalanceWithService, debitCredits } from "@/lib/billing/credits";
import { notifyTenant } from "@/lib/notifications";
import { getAppUrl } from "@/lib/stripe";
import { getSuppressionSet, canonicalAddress } from "./suppression";
import { unsubCopy } from "./unsubscribe-copy";

/**
 * Marketing execution engine. Driven by an n8n cron hitting /api/marketing/tick
 * (every ~3 min). Each tick sends a bounded batch of DUE queued messages across
 * approved/running campaigns. Runs WITHOUT a user session (bearer-authed), so it
 * talks to the DB + transports directly.
 *
 * Per message: atomic claim (queued→sending) → send → debit on confirmed success.
 * Send-first-then-debit avoids charging for an unsent message. When the tenant
 * runs out of credits (or hits the budget cap, or the channel isn't configured),
 * the campaign is PAUSED with its remaining messages left QUEUED — so resuming
 * (after a top-up / fixing the channel) picks up exactly where it stopped.
 *
 * Concurrency / crash safety:
 *  - The n8n schedule (3 min) is wider than the route's maxDuration (60s), so two
 *    ticks never overlap. Any message still in 'sending' at the START of a tick is
 *    therefore stranded from a crashed/timed-out prior run → reclaimed to 'queued'.
 *  - Each send is claimed atomically (UPDATE … WHERE status='queued' RETURNING),
 *    so even under an unexpected overlap a message is sent by exactly one tick.
 *  - A GLOBAL per-tick send cap bounds total work so many campaigns can't push a
 *    single invocation past 60s (which is what would strand messages).
 *  - Enrollment is idempotent at the DB layer (the unique index), so re-approve
 *    never double-enqueues.
 *
 * Safety: only status in (approved,running) runs; cancelled is the kill switch.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient & { from: (t: string) => any };

const COST_KEY: Record<MarketingChannel, string> = {
  email: "marketing.email_broadcast",
  whatsapp: "marketing.whatsapp_broadcast",
  sms: "marketing.sms_broadcast",
};

// Per campaign: cap rows pulled per tick. Global: cap total sends per tick so the
// invocation stays well inside maxDuration (60s) regardless of how many campaigns
// are active (~1–1.5s/send → 25 ≈ 40s worst case, leaving margin).
const PER_TICK_PER_CAMPAIGN = 30;
const GLOBAL_PER_TICK = 25;

type CampaignRow = {
  id: string;
  tenant_id: string;
  title: string;
  channel: MarketingChannel;
  status: string;
  budget_credits: number | null;
  spent_credits: number;
  sent_count: number;
  failed_count: number;
};

type MessageRow = {
  id: string;
  to_address: string;
  subject: string | null;
  body: string;
};

export type MarketingTickSummary = {
  campaigns: number;
  sent: number;
  failed: number;
};

async function loadPricing(svc: AnyClient): Promise<Record<string, number>> {
  const { data } = await svc
    .from("credit_pricing")
    .select("action_key, credits_per_unit")
    .like("action_key", "marketing.%");
  const map: Record<string, number> = {};
  for (const r of (data ?? []) as Array<{ action_key: string; credits_per_unit: number }>) {
    map[r.action_key] = Number(r.credits_per_unit) || 0;
  }
  return map;
}

// Notifications link to the dashboard; the tenant slug is resolved client-side
// from the active tenant, so a tenant-relative path is enough.
const MARKETING_HREF = "/dashboard";

async function persistCounters(
  svc: AnyClient,
  campaignId: string,
  counters: { spent: number; sent: number; failed: number },
) {
  await svc
    .from("marketing_campaigns")
    .update({ spent_credits: counters.spent, sent_count: counters.sent, failed_count: counters.failed })
    .eq("id", campaignId);
}

async function pauseCampaign(
  svc: AnyClient,
  c: CampaignRow,
  counters: { spent: number; sent: number; failed: number },
  noticeBody: string,
) {
  await svc.from("marketing_campaigns").update({ status: "paused" }).eq("id", c.id);
  await persistCounters(svc, c.id, counters);
  // Remaining messages stay QUEUED (not skipped) so resume re-sends them.
  await notifyTenant(c.tenant_id, {
    type: "marketing",
    title: `Campaña pausada: ${c.title}`,
    body: noticeBody,
    href: MARKETING_HREF,
  });
}

async function queuedCount(svc: AnyClient, campaignId: string): Promise<number> {
  const { count } = await svc
    .from("marketing_messages")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("status", "queued");
  return count ?? 0;
}

async function finishCampaign(svc: AnyClient, c: CampaignRow, counters: { sent: number; failed: number }) {
  await svc.from("marketing_campaigns").update({ status: "done" }).eq("id", c.id);
  await notifyTenant(c.tenant_id, {
    type: "marketing",
    title: `Campaña completada: ${c.title}`,
    body: `${counters.sent} enviados, ${counters.failed} fallidos.`,
    href: MARKETING_HREF,
  });
}

export async function runMarketingTick(opts: { tenantId?: string } = {}): Promise<MarketingTickSummary> {
  const svc = createServiceClient() as unknown as AnyClient;
  const nowIso = new Date().toISOString();
  const pricing = await loadPricing(svc);
  const appUrl = getAppUrl();

  // Crash recovery: reclaim any message stranded mid-send by a prior crashed/
  // timed-out tick. Safe because ticks never overlap (3 min > 60s maxDuration),
  // so a 'sending' row at tick start is always stale.
  {
    let rq = svc.from("marketing_messages").update({ status: "queued" }).eq("status", "sending");
    if (opts.tenantId) rq = rq.eq("tenant_id", opts.tenantId);
    await rq;
  }

  let cq = svc
    .from("marketing_campaigns")
    .select("id, tenant_id, title, channel, status, budget_credits, spent_credits, sent_count, failed_count")
    .in("status", ["approved", "running"])
    .order("created_at", { ascending: true });
  if (opts.tenantId) cq = cq.eq("tenant_id", opts.tenantId);
  const { data: camps } = await cq;
  const campaigns = (camps ?? []) as CampaignRow[];

  let totalSent = 0;
  let totalFailed = 0;
  let globalRemaining = GLOBAL_PER_TICK;

  for (const c of campaigns) {
    if (globalRemaining <= 0) break; // out of per-tick budget — next tick continues

    const channel = c.channel;
    const unitCost = pricing[COST_KEY[channel]] ?? 1;
    const counters = { spent: c.spent_credits, sent: c.sent_count, failed: c.failed_count };

    // Budget gate (before any send this tick).
    if (c.budget_credits != null && counters.spent >= c.budget_credits) {
      await pauseCampaign(svc, c, counters, "Se alcanzó el presupuesto de créditos de la campaña.");
      continue;
    }

    // Pull a bounded batch of DUE queued messages.
    const { data: msgs } = await svc
      .from("marketing_messages")
      .select("id, to_address, subject, body")
      .eq("campaign_id", c.id)
      .eq("status", "queued")
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(Math.min(PER_TICK_PER_CAMPAIGN, globalRemaining));
    const messages = (msgs ?? []) as MessageRow[];

    if (messages.length === 0) {
      // Nothing DUE. Close the campaign only if NO queued messages remain at all
      // (a future-scheduled campaign keeps its queued rows and stays approved).
      if ((await queuedCount(svc, c.id)) === 0) await finishCampaign(svc, c, counters);
      continue;
    }

    // First send flips approved → running.
    if (c.status === "approved") {
      await svc.from("marketing_campaigns").update({ status: "running" }).eq("id", c.id);
    }

    // Resolve the WhatsApp instance once for the whole campaign.
    const evolutionInstance = channel === "whatsapp" ? await resolveEvolutionInstance(c.tenant_id) : undefined;

    // Opt-out context: tenant language drives the localized unsubscribe copy, and
    // the suppression set lets us skip anyone who opted out after enrollment.
    const { data: tRow } = await svc.from("tenants").select("language").eq("id", c.tenant_id).maybeSingle();
    const copy = unsubCopy((tRow as { language: string | null } | null)?.language);
    const suppressed = await getSuppressionSet(c.tenant_id);

    // Read the balance ONCE per batch (not per message — keeps us inside the 60s
    // window); decrement locally by what we actually debit. There are no marketing
    // reservations, so available_credits stays the correct spendable headroom.
    const bal0 = await getBalanceWithService(c.tenant_id);
    let available = bal0?.available_credits ?? 0;

    let stopCampaign = false; // paused → skip the done-check
    for (const m of messages) {
      if (globalRemaining <= 0) break; // global cap reached — leave the rest queued

      // Opt-out honored at send time (catches unsubscribes after enrollment).
      // Permanent per-recipient skip → never resent on resume.
      if (suppressed.has(canonicalAddress(m.to_address))) {
        await svc.from("marketing_messages").update({ status: "skipped", error: "unsubscribed" }).eq("id", m.id);
        globalRemaining -= 1;
        continue;
      }

      // Budget cap mid-batch → pause (leave remaining queued).
      if (c.budget_credits != null && counters.spent + unitCost > c.budget_credits) {
        await pauseCampaign(svc, c, counters, "Se alcanzó el presupuesto de créditos de la campaña.");
        stopCampaign = true;
        break;
      }
      // Out of credits → pause (leave remaining queued).
      if (available < unitCost) {
        await pauseCampaign(svc, c, counters, "Saldo de créditos insuficiente. Recarga para continuar la campaña.");
        stopCampaign = true;
        break;
      }

      // Atomic claim — only the tick that flips queued→sending may send this row.
      const claim = await svc
        .from("marketing_messages")
        .update({ status: "sending" })
        .eq("id", m.id)
        .eq("status", "queued")
        .select("id");
      if (((claim.data ?? []) as unknown[]).length === 0) continue; // lost the claim

      globalRemaining -= 1;
      const unsubscribe: UnsubscribeCtx = {
        pageUrl: `${appUrl}/u/${m.id}`,
        oneClickUrl: `${appUrl}/api/marketing/unsubscribe?token=${m.id}`,
        label: copy.label,
        notice: copy.notice,
      };
      const r = await sendOnChannel(
        c.tenant_id,
        channel,
        { to: m.to_address, subject: m.subject, body: m.body },
        { evolutionInstance, unsubscribe },
      );

      if (r.ok) {
        const deb = await debitCredits({
          tenantId: c.tenant_id,
          actionKey: COST_KEY[channel],
          units: 1,
          referenceId: m.id,
          metadata: { campaign_id: c.id, channel },
        });
        await svc
          .from("marketing_messages")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", m.id);
        counters.sent += 1;
        totalSent += 1;
        if (deb.ok) {
          counters.spent += deb.credits_debited;
          available -= deb.credits_debited; // reserved stays constant during the batch
        } else {
          // Sent, but the charge failed — the pool was drained concurrently
          // (e.g. a voice call) below our per-batch snapshot. Stop here so we
          // don't keep sending for free; remaining stay queued for resume.
          await pauseCampaign(svc, c, counters, "Saldo de créditos insuficiente. Recarga para continuar la campaña.");
          stopCampaign = true;
          break;
        }
      } else {
        await svc
          .from("marketing_messages")
          .update({ status: "failed", error: (r.error || "").slice(0, 400) })
          .eq("id", m.id);
        counters.failed += 1;
        totalFailed += 1;
        // A misconfigured channel applies to every recipient — pause (leave the
        // rest queued) so fixing the channel + resuming re-sends them.
        if (r.noConfig) {
          await pauseCampaign(svc, c, counters, r.error);
          stopCampaign = true;
          break;
        }
      }
    }

    if (stopCampaign) continue;

    await persistCounters(svc, c.id, counters);

    // Close the campaign if nothing remains queued at all.
    if ((await queuedCount(svc, c.id)) === 0) await finishCampaign(svc, c, counters);
  }

  return { campaigns: campaigns.length, sent: totalSent, failed: totalFailed };
}
