import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { sendOnChannel, resolveEvolutionInstance, type MarketingChannel } from "./channels";
import { getBalanceWithService, debitCredits } from "@/lib/billing/credits";
import { notifyTenant } from "@/lib/notifications";

/**
 * Marketing execution engine. Driven by an n8n cron hitting /api/marketing/tick
 * (~every 1–2 min). Each tick advances every approved/running campaign by sending
 * a bounded batch of its DUE queued messages. Runs WITHOUT a user session
 * (bearer-authed), so it talks to the DB + transports directly.
 *
 * Per message: balance pre-check → send → debit on confirmed success. We send
 * first then debit (avoids charging for an unsent message); the pre-check stops
 * the campaign cleanly when the tenant runs out of credits (mark remaining
 * skipped + pause + notify) rather than half-sending. Idempotency is at the DB
 * layer (the unique enrollment index) so a re-tick never double-enqueues.
 *
 * Safety: only status in (approved,running) runs; cancelled is the kill switch;
 * a budget_credits cap pauses on exhaustion; a channel that isn't configured
 * (no sender / no instance / no Twilio) pauses the campaign instead of churning
 * per-recipient failures.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient & { from: (t: string) => any };

const COST_KEY: Record<MarketingChannel, string> = {
  email: "marketing.email_broadcast",
  whatsapp: "marketing.whatsapp_broadcast",
  sms: "marketing.sms_broadcast",
};

// Bound work per campaign per tick: sequential sends must finish within the
// route's maxDuration (60s on Vercel). ~1–1.5s/send → 30 keeps a safe margin.
const PER_TICK_PER_CAMPAIGN = 30;

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
  skipped: number;
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

async function pauseCampaign(
  svc: AnyClient,
  c: CampaignRow,
  counters: { spent: number; sent: number; failed: number },
  notice: { title: string; body: string },
) {
  await svc
    .from("marketing_campaigns")
    .update({
      status: "paused",
      spent_credits: counters.spent,
      sent_count: counters.sent,
      failed_count: counters.failed,
    })
    .eq("id", c.id);
  await notifyTenant(c.tenant_id, { type: "marketing", title: notice.title, body: notice.body, href: MARKETING_HREF });
}

export async function runMarketingTick(opts: { tenantId?: string } = {}): Promise<MarketingTickSummary> {
  const svc = createServiceClient() as unknown as AnyClient;
  const nowIso = new Date().toISOString();
  const pricing = await loadPricing(svc);

  let cq = svc
    .from("marketing_campaigns")
    .select("id, tenant_id, title, channel, status, budget_credits, spent_credits, sent_count, failed_count")
    .in("status", ["approved", "running"]);
  if (opts.tenantId) cq = cq.eq("tenant_id", opts.tenantId);
  const { data: camps } = await cq;
  const campaigns = (camps ?? []) as CampaignRow[];

  let totalSent = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const c of campaigns) {
    const channel = c.channel;
    const costKey = COST_KEY[channel];
    const unitCost = pricing[costKey] ?? 1;
    const counters = { spent: c.spent_credits, sent: c.sent_count, failed: c.failed_count };

    // Budget gate (before any send this tick).
    if (c.budget_credits != null && counters.spent >= c.budget_credits) {
      await pauseCampaign(svc, c, counters, {
        title: `Campaña pausada: ${c.title}`,
        body: "Se alcanzó el presupuesto de créditos de la campaña.",
      });
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
      .limit(PER_TICK_PER_CAMPAIGN);
    const messages = (msgs ?? []) as MessageRow[];

    if (messages.length === 0) {
      // Nothing due. If NO queued messages remain at all, the campaign is done.
      const { count } = await svc
        .from("marketing_messages")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", c.id)
        .eq("status", "queued");
      if ((count ?? 0) === 0) {
        await svc.from("marketing_campaigns").update({ status: "done" }).eq("id", c.id);
        await notifyTenant(c.tenant_id, {
          type: "marketing",
          title: `Campaña completada: ${c.title}`,
          body: `${counters.sent} enviados, ${counters.failed} fallidos.`,
          href: MARKETING_HREF,
        });
      }
      continue;
    }

    // First send flips approved → running.
    if (c.status === "approved") {
      await svc.from("marketing_campaigns").update({ status: "running" }).eq("id", c.id);
    }

    // Resolve the WhatsApp instance once for the whole campaign.
    const evolutionInstance = channel === "whatsapp" ? await resolveEvolutionInstance(c.tenant_id) : undefined;

    // Read the balance ONCE per batch (not per message — keeps us inside the 60s
    // window); track it locally, refreshing from each debit's authoritative
    // balance_after. Stops cleanly the moment credits can't cover the next send.
    const bal0 = await getBalanceWithService(c.tenant_id);
    let available = bal0?.available_credits ?? 0;

    let paused = false;
    for (const m of messages) {
      // Budget cap mid-batch.
      if (c.budget_credits != null && counters.spent + unitCost > c.budget_credits) {
        totalSkipped += await markRemainingSkipped(svc, c.id, "presupuesto alcanzado");
        await pauseCampaign(svc, c, counters, {
          title: `Campaña pausada: ${c.title}`,
          body: "Se alcanzó el presupuesto de créditos de la campaña.",
        });
        paused = true;
        break;
      }

      // Balance gate — out of credits → stop cleanly.
      if (available < unitCost) {
        totalSkipped += await markRemainingSkipped(svc, c.id, "saldo insuficiente");
        await pauseCampaign(svc, c, counters, {
          title: `Campaña pausada: ${c.title}`,
          body: "Saldo de créditos insuficiente. Recarga para continuar la campaña.",
        });
        paused = true;
        break;
      }

      await svc.from("marketing_messages").update({ status: "sending" }).eq("id", m.id);
      const r = await sendOnChannel(
        c.tenant_id,
        channel,
        { to: m.to_address, subject: m.subject, body: m.body },
        { evolutionInstance },
      );

      if (r.ok) {
        const deb = await debitCredits({
          tenantId: c.tenant_id,
          actionKey: costKey,
          units: 1,
          referenceId: m.id,
          metadata: { campaign_id: c.id, channel },
        });
        await svc
          .from("marketing_messages")
          .update({ status: "sent", sent_at: new Date().toISOString() })
          .eq("id", m.id);
        if (deb.ok) {
          counters.spent += deb.credits_debited;
          available = deb.balance_after; // authoritative post-debit balance
        }
        counters.sent += 1;
        totalSent += 1;
      } else {
        await svc
          .from("marketing_messages")
          .update({ status: "failed", error: (r.error || "").slice(0, 400) })
          .eq("id", m.id);
        counters.failed += 1;
        totalFailed += 1;
        // A misconfigured channel applies to every recipient — pause, don't churn.
        if (r.noConfig) {
          totalSkipped += await markRemainingSkipped(svc, c.id, "canal no configurado");
          await pauseCampaign(svc, c, counters, {
            title: `Campaña pausada: ${c.title}`,
            body: r.error,
          });
          paused = true;
          break;
        }
      }
    }

    if (paused) continue;

    // Persist counters for this batch.
    await svc
      .from("marketing_campaigns")
      .update({ spent_credits: counters.spent, sent_count: counters.sent, failed_count: counters.failed })
      .eq("id", c.id);

    // Close the campaign if nothing remains queued.
    const { count: remain } = await svc
      .from("marketing_messages")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", c.id)
      .eq("status", "queued");
    if ((remain ?? 0) === 0) {
      await svc.from("marketing_campaigns").update({ status: "done" }).eq("id", c.id);
      await notifyTenant(c.tenant_id, {
        type: "marketing",
        title: `Campaña completada: ${c.title}`,
        body: `${counters.sent} enviados, ${counters.failed} fallidos.`,
        href: MARKETING_HREF,
      });
    }
  }

  return { campaigns: campaigns.length, sent: totalSent, failed: totalFailed, skipped: totalSkipped };
}

async function markRemainingSkipped(svc: AnyClient, campaignId: string, reason: string): Promise<number> {
  const { data } = await svc
    .from("marketing_messages")
    .update({ status: "skipped", error: reason })
    .eq("campaign_id", campaignId)
    .eq("status", "queued")
    .select("id");
  return ((data ?? []) as unknown[]).length;
}
