import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { findBusinessEmail, isRealBusinessWebsite, normalizeUrl } from "./email-scrape";

/**
 * Lead email-enrichment engine. Driven by an n8n cron hitting /api/enrich/tick
 * (~5 min). Finds leads that have a business website (AIMA captures it from
 * Google Maps) but no email, scrapes the site for a public business email, and
 * fills `leads.email`. Free — no third-party API.
 *
 * Each lead is attempted ONCE (a `metadata.email_enrich_attempted_at` stamp),
 * so the tick makes forward progress and never re-hammers the same site. Gated
 * per-tenant by `aima_settings.email_enrichment_enabled` (default on). Also
 * promotes the site into the real `website` column when it was only in metadata.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient & { from: (t: string) => any };

const BATCH = 24; // leads examined per tick
const CONCURRENCY = 6; // simultaneous site fetches
const DEADLINE_MS = 48_000; // stay inside the route's 60s maxDuration

type LeadRow = {
  id: string;
  tenant_id: string;
  email: string | null;
  website: string | null;
  metadata: Record<string, unknown> | null;
};

export type EnrichTickSummary = {
  scanned: number;
  emails_found: number;
  websites_promoted: number;
  no_email: number;
};

export async function runEmailEnrichmentTick(opts: { tenantId?: string } = {}): Promise<EnrichTickSummary> {
  const svc = createServiceClient() as unknown as AnyClient;
  const deadline = Date.now() + DEADLINE_MS;
  const nowIso = new Date().toISOString();

  // Candidate leads: no email yet + never attempted. (An absent metadata key →
  // `->>` is NULL → matches `is null`, so brand-new leads qualify.)
  let q = svc
    .from("leads")
    .select("id, tenant_id, email, website, metadata")
    .or("email.is.null,email.eq.")
    .filter("metadata->>email_enrich_attempted_at", "is", null)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (opts.tenantId) q = q.eq("tenant_id", opts.tenantId);
  const { data } = await q;
  const leads = (data ?? []) as LeadRow[];
  if (leads.length === 0) return { scanned: 0, emails_found: 0, websites_promoted: 0, no_email: 0 };

  // Per-tenant gate: skip tenants that turned enrichment off (default ON).
  const tenantIds = Array.from(new Set(leads.map((l) => l.tenant_id)));
  const { data: settingsRows } = await svc
    .from("aima_settings")
    .select("tenant_id, email_enrichment_enabled")
    .in("tenant_id", tenantIds);
  const disabled = new Set(
    ((settingsRows ?? []) as Array<{ tenant_id: string; email_enrichment_enabled: boolean | null }>)
      .filter((r) => r.email_enrichment_enabled === false)
      .map((r) => r.tenant_id),
  );
  const work = leads.filter((l) => !disabled.has(l.tenant_id));

  const summary: EnrichTickSummary = { scanned: 0, emails_found: 0, websites_promoted: 0, no_email: 0 };

  const processOne = async (lead: LeadRow) => {
    const meta = lead.metadata ?? {};
    const site = (typeof meta.website === "string" && meta.website) || lead.website || "";

    const patch: Record<string, unknown> = {
      metadata: { ...meta, email_enrich_attempted_at: nowIso },
    };

    if (isRealBusinessWebsite(site)) {
      // Backfill the real `website` column when it only lived in metadata.
      const normalized = normalizeUrl(site)?.toString();
      if (normalized && (!lead.website || !lead.website.trim())) {
        patch.website = normalized;
        summary.websites_promoted += 1;
      }
      const { email, emails } = await findBusinessEmail(site);
      if (email) {
        patch.email = email; // primary (Sandra / display)
        (patch.metadata as Record<string, unknown>).emails = emails; // keep ALL found
        (patch.metadata as Record<string, unknown>).email_source = "website_scrape";
        summary.emails_found += 1;
      } else {
        summary.no_email += 1;
      }
    } else {
      summary.no_email += 1;
    }

    await svc.from("leads").update(patch as never).eq("id", lead.id);
    summary.scanned += 1;
  };

  // Bounded-concurrency pool with an overall deadline.
  for (let i = 0; i < work.length; i += CONCURRENCY) {
    if (Date.now() >= deadline) break;
    await Promise.all(work.slice(i, i + CONCURRENCY).map((l) => processOne(l).catch(() => {})));
  }

  return summary;
}
