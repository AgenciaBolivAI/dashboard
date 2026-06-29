import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { getSuppressionSet, canonicalAddress } from "./suppression";
import type { MarketingChannel } from "./channels";

/**
 * Resolve a campaign's audience filter into a concrete recipient list, each with
 * a channel-appropriate address (frozen at enqueue time). Pulls from two pools:
 *   leads      the lead pipeline (cold/warm prospects) — excludes do_not_contact
 *   customers  `users` (existing customers with reservations/invoices)
 *
 * Recipients without a usable address for the channel (no email for an email
 * blast, no phone for WhatsApp/SMS) are silently dropped, and addresses are
 * de-duplicated so the same person is never messaged twice in one campaign.
 */
export type AudienceFilter = {
  source?: "leads" | "customers" | "both";
  lead_status?: string | null;
  lead_source?: string | null;
  vip_only?: boolean;
  limit?: number;
};

export type Recipient = {
  kind: "lead" | "user";
  id: string;
  to: string;
  name: string | null;
};

export const MAX_RECIPIENTS = 5000;

/** True when this filter targets leads (cold outreach) and needs the consent gate. */
export function audienceIncludesLeads(filter: AudienceFilter): boolean {
  return (filter.source ?? "both") !== "customers";
}

function normalizeAddress(channel: MarketingChannel, addr: unknown): string | null {
  if (typeof addr !== "string") return null;
  const v = addr.trim();
  if (!v) return null;
  if (channel === "email") {
    return /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(v) ? v : null;
  }
  // whatsapp / sms — keep digits; require a plausible length
  const digits = v.replace(/[^\d]/g, "");
  if (digits.length < 8) return null;
  // SMS wants E.164 (+...), WhatsApp/Evolution wants bare digits
  return channel === "sms" ? `+${digits}` : digits;
}

export async function resolveAudience(
  tenantId: string,
  channel: MarketingChannel,
  filter: AudienceFilter,
): Promise<Recipient[]> {
  const svc = createServiceClient() as unknown as SupabaseClient;
  const needsEmail = channel === "email";
  const cap = Math.min(MAX_RECIPIENTS, Math.max(1, filter.limit ?? MAX_RECIPIENTS));
  const src = filter.source ?? "both";
  const out: Recipient[] = [];
  const seen = new Set<string>();
  const suppressed = await getSuppressionSet(tenantId); // opt-outs

  const push = (kind: "lead" | "user", id: string, addr: unknown, name: string | null) => {
    const norm = normalizeAddress(channel, addr);
    if (!norm || seen.has(norm)) return;
    if (suppressed.has(canonicalAddress(norm))) return; // honor opt-out
    seen.add(norm);
    out.push({ kind, id, to: norm, name });
  };

  if (src === "leads" || src === "both") {
    let q = svc
      .from("leads")
      .select("id, name, email, whatsapp_number, status")
      .eq("tenant_id", tenantId)
      .neq("status", "do_not_contact")
      .order("created_at", { ascending: false })
      .limit(cap);
    if (filter.lead_status) q = q.eq("status", filter.lead_status);
    if (filter.lead_source) q = q.eq("source", filter.lead_source);
    const { data } = await q;
    for (const r of (data ?? []) as Array<{ id: string; name: string | null; email: string | null; whatsapp_number: string | null }>) {
      push("lead", r.id, needsEmail ? r.email : r.whatsapp_number, r.name);
      if (out.length >= cap) return out;
    }
  }

  if (src === "customers" || src === "both") {
    let q = svc
      .from("users")
      .select("id, name, email, whatsapp_number, is_vip")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(cap);
    if (filter.vip_only) q = q.eq("is_vip", true);
    const { data } = await q;
    for (const r of (data ?? []) as Array<{ id: string; name: string | null; email: string | null; whatsapp_number: string | null }>) {
      push("user", r.id, needsEmail ? r.email : r.whatsapp_number, r.name);
      if (out.length >= cap) return out;
    }
  }

  return out;
}
