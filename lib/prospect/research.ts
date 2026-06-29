import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { chatCompletion, searchModel } from "@/lib/llm";
import { debitCredits, getBalanceWithService } from "@/lib/billing/credits";

/**
 * BOLIV prospect research. Uses OpenAI's web-search model (gpt-4o-search-preview)
 * to produce a grounded briefing about a lead/customer (their company + the
 * person + talking points), plus a cheap gpt-4o-mini pass to extract structured
 * chips for the UI. Written in the tenant's language. Billed `research.prospect`.
 *
 * Lifecycle: upsert the row to 'running' → generate → debit on success → write
 * 'done' (summary/structured/sources) or 'failed' (error). One current row per
 * (tenant, subject) — a re-run updates it. Balance is pre-checked so a broke
 * tenant can't burn the (pricier) search model; never throws.
 */
export type SubjectKind = "lead" | "customer";
export type ResearchResult = { ok: true } | { ok: false; error: string };

type Structured = {
  headline?: string;
  industry?: string;
  company_size?: string;
  key_people?: Array<{ name?: string; role?: string }>;
  talking_points?: string[];
  website?: string;
};

const RESEARCH_ACTION = "research.prospect";

async function priceOf(svc: SupabaseClient, actionKey: string, fallback: number): Promise<number> {
  const { data } = await svc.from("credit_pricing").select("credits_per_unit").eq("action_key", actionKey).maybeSingle();
  return Number((data as { credits_per_unit: number } | null)?.credits_per_unit ?? fallback);
}

/** Pull the known facts about a lead/customer to seed the web search. */
async function loadSubject(
  svc: SupabaseClient,
  tenantId: string,
  kind: SubjectKind,
  id: string,
): Promise<{ facts: string; label: string } | null> {
  if (kind === "lead") {
    const { data } = await svc
      .from("leads")
      .select("name, email, whatsapp_number, intent, notes, source, website, metadata")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const l = data as
      | { name: string | null; email: string | null; whatsapp_number: string | null; intent: string | null; notes: string | null; website: string | null; metadata: Record<string, unknown> | null }
      | null;
    if (!l) return null;
    const m = l.metadata ?? {};
    const facts = [
      l.name && `Name/business: ${l.name}`,
      l.email && `Email: ${l.email}`,
      (l.website || m.website) && `Website: ${l.website || m.website}`,
      m.vertical && `Industry/vertical: ${String(m.vertical).replace(/_/g, " ")}`,
      [m.city, m.state, m.address].filter(Boolean).length && `Location: ${[m.city, m.state, m.address].filter(Boolean).join(", ")}`,
      l.intent && `They reached out about: ${l.intent.replace(/_/g, " ")}`,
      l.notes && `Notes: ${l.notes.slice(0, 400)}`,
    ].filter(Boolean).join("\n");
    return { facts, label: l.name ?? l.email ?? "this lead" };
  }
  const { data } = await svc
    .from("users")
    .select("name, email, whatsapp_number, business_name, point_of_contact, metadata")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const u = data as
    | { name: string | null; email: string | null; business_name: string | null; point_of_contact: string | null; metadata: Record<string, unknown> | null }
    | null;
  if (!u) return null;
  const facts = [
    u.name && `Contact name: ${u.name}`,
    u.business_name && `Company: ${u.business_name}`,
    u.point_of_contact && `Point of contact: ${u.point_of_contact}`,
    u.email && `Email: ${u.email}`,
  ].filter(Boolean).join("\n");
  return { facts, label: u.business_name ?? u.name ?? "this customer" };
}

export async function runProspectResearch(
  tenantId: string,
  kind: SubjectKind,
  subjectId: string,
  requestedBy?: string | null,
  localeOverride?: string | null,
): Promise<ResearchResult> {
  const svc = createServiceClient() as unknown as SupabaseClient;

  const { data: t } = await svc.from("tenants").select("name, language").eq("id", tenantId).maybeSingle();
  const tenant = t as { name: string | null; language: string | null } | null;
  // Prefer the caller's current UI locale (on-demand from a request); fall back
  // to the tenant's configured language for the background tick (no request).
  const lang = (localeOverride || tenant?.language || "es").slice(0, 5);

  const subject = await loadSubject(svc, tenantId, kind, subjectId);
  if (!subject) return { ok: false, error: "subject_not_found" };

  // Mark running (upsert so on-demand + tick share one row).
  await svc.from("prospect_research").upsert(
    { tenant_id: tenantId, subject_kind: kind, subject_id: subjectId, status: "running", requested_by: requestedBy ?? null, error: null },
    { onConflict: "tenant_id,subject_kind,subject_id" },
  );

  const cost = await priceOf(svc, RESEARCH_ACTION, 15);
  const bal = await getBalanceWithService(tenantId);
  if (!bal || bal.available_credits < cost) {
    await svc.from("prospect_research").update({ status: "failed", error: "insufficient_credits" }).eq("tenant_id", tenantId).eq("subject_kind", kind).eq("subject_id", subjectId);
    return { ok: false, error: "insufficient_credits" };
  }

  // 1) Web-grounded briefing (no temperature — the search model rejects it).
  const sys =
    `You are BOLIV, a B2B sales-research assistant for "${tenant?.name || "this business"}". ` +
    `Research the prospect below using the web and write a SHORT briefing so a salesperson knows who they'll talk to. ` +
    `Use these markdown sections (translate the headings to the target language): ` +
    `**Who they are** (the company: what it does, industry, size/signals), **The person** (role + background if findable), ` +
    `**Talking points** (2–4 concrete angles to open a relevant conversation). ` +
    `Be factual; if you can't verify something, say so briefly. No preamble, no closing remarks. ` +
    `Write entirely in this language (BCP-47): ${lang}.`;
  const brief = await chatCompletion({
    model: searchModel(),
    temperature: null,
    webSearchOptions: { search_context_size: "medium" },
    maxTokens: 900,
    messages: [
      { role: "system", content: sys },
      { role: "user", content: `Prospect facts (from the CRM):\n${subject.facts}` },
    ],
    timeoutMs: 55_000,
  });
  if (!brief.ok) {
    await svc.from("prospect_research").update({ status: "failed", error: brief.error.slice(0, 400) }).eq("tenant_id", tenantId).eq("subject_kind", kind).eq("subject_id", subjectId);
    return { ok: false, error: brief.error };
  }
  const summary = (brief.message.content ?? "").trim();
  const sources = (brief.message.annotations ?? [])
    .map((a) => a.url_citation)
    .filter((c): c is { url?: string; title?: string } => Boolean(c?.url))
    .map((c) => ({ title: (c.title ?? c.url ?? "").slice(0, 160), url: c.url! }))
    .slice(0, 8);

  // 2) Structured chips for the UI (cheap model, JSON).
  let structured: Structured = {};
  const extract = await chatCompletion({
    model: "gpt-4o-mini",
    temperature: 0,
    responseFormat: { type: "json_object" },
    maxTokens: 500,
    messages: [
      { role: "system", content: `Extract structured fields from this prospect briefing. Return STRICT JSON: {"headline": string (≤90 chars, who they are), "industry": string|null, "company_size": string|null, "key_people": [{"name": string, "role": string}], "talking_points": [string], "website": string|null}. Keep values in the briefing's language.` },
      { role: "user", content: summary.slice(0, 4000) },
    ],
  });
  if (extract.ok) {
    try {
      structured = JSON.parse(extract.message.content ?? "{}") as Structured;
    } catch {
      /* keep empty */
    }
  }

  // 3) Charge for the delivered research.
  const deb = await debitCredits({
    tenantId,
    actionKey: RESEARCH_ACTION,
    units: 1,
    referenceId: subjectId,
    metadata: { subject_kind: kind },
    actorUserId: requestedBy ?? null,
  });

  await svc
    .from("prospect_research")
    .update({
      status: "done",
      summary,
      structured: structured as unknown as Record<string, never>,
      sources: sources as unknown as Record<string, never>,
      model: searchModel(),
      generated_at: new Date().toISOString(),
      error: deb.ok ? null : `charged_failed:${deb.reason ?? ""}`.slice(0, 200),
    } as never)
    .eq("tenant_id", tenantId)
    .eq("subject_kind", kind)
    .eq("subject_id", subjectId);

  return { ok: true };
}

/** Enqueue research for a freshly-created inbound lead (auto path). Best-effort,
 * idempotent — a row already present (any status) is left alone. */
export async function enqueueProspectResearch(tenantId: string, kind: SubjectKind, subjectId: string): Promise<void> {
  const svc = createServiceClient() as unknown as SupabaseClient;
  await svc
    .from("prospect_research")
    .upsert(
      { tenant_id: tenantId, subject_kind: kind, subject_id: subjectId, status: "queued" },
      { onConflict: "tenant_id,subject_kind,subject_id", ignoreDuplicates: true },
    );
}

/** Source buckets a tenant can opt into for AUTO research. Bulk scrapes (aima) are
 * deliberately absent from the default so a big import can't drain credits. */
export const AUTO_SOURCE_BUCKETS = ["form", "whatsapp", "voice", "meta"] as const;
export type AutoSourceBucket = (typeof AUTO_SOURCE_BUCKETS)[number];

/**
 * Gate + enqueue auto-research for a freshly-created INBOUND lead. Reads the
 * tenant's prospect_settings (defaults: enabled, all four inbound buckets) and
 * only enqueues when auto-research is on AND this source bucket is selected.
 * Best-effort and idempotent — wrapped so it can never block lead creation.
 */
export async function maybeEnqueueInboundResearch(
  tenantId: string,
  leadId: string,
  bucket: AutoSourceBucket,
): Promise<void> {
  try {
    const svc = createServiceClient() as unknown as SupabaseClient;
    const { data } = await svc
      .from("prospect_settings")
      .select("auto_research_enabled, auto_sources")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const s = data as { auto_research_enabled?: boolean; auto_sources?: string[] } | null;
    const enabled = s?.auto_research_enabled ?? true;
    const sources = s?.auto_sources ?? [...AUTO_SOURCE_BUCKETS];
    if (!enabled || !sources.includes(bucket)) return;
    await enqueueProspectResearch(tenantId, "lead", leadId);
  } catch {
    /* never block the inbound path */
  }
}
