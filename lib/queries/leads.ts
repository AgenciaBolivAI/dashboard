import { createClient } from "@/lib/supabase/server";

export type Lead = {
  id: string;
  name: string | null;
  whatsapp_number: string | null;
  email: string | null;
  intent: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  conversation_id: string | null;
  source: string | null;
  metadata: Record<string, unknown> | null;
};

export type LeadFilters = {
  status?: string;
  intent?: string;
  source?: string;
  city?: string;
  vertical?: string;
  country?: string;   // ISO alpha-2 (e.g. "US", "MX", "BO")
  state?: string;     // free-form, matched against metadata.{state,region}
  limit?: number;
};

import { COUNTRY_BY_CODE, getCountryFromPhone, getStateFromMetadata } from "@/lib/leads-geo";

export async function listLeads(
  tenantId: string,
  opts: LeadFilters = {},
): Promise<Lead[]> {
  const supabase = await createClient();
  let q = supabase
    .from("leads")
    .select(
      "id, name, whatsapp_number, email, intent, status, notes, created_at, conversation_id, source, metadata",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 500);

  if (opts.status) q = q.eq("status", opts.status);
  if (opts.intent) q = q.eq("intent", opts.intent);
  if (opts.source) q = q.eq("source", opts.source);
  // City + vertical live in metadata (populated by AIMA's Google Maps run).
  // Postgres JSONB → contains operator. Single-key filter is fast even without index at our scale.
  if (opts.city) q = q.contains("metadata", { city: opts.city });
  if (opts.vertical) q = q.contains("metadata", { vertical: opts.vertical });

  // Country filter — derived from the phone prefix. Postgres doesn't store
  // the country directly, so we filter by `whatsapp_number LIKE prefix%`.
  // This is cheap because we already limit to 500 rows by tenant.
  if (opts.country) {
    const c = COUNTRY_BY_CODE[opts.country];
    if (c) q = q.like("whatsapp_number", `${c.prefix}%`);
  }

  const { data } = await q;
  let rows = (data ?? []) as Lead[];

  // State filter happens client-side because metadata.state and metadata.region
  // are both valid storage paths. PostgREST's `contains` only matches one key
  // at a time and would require two queries; this filter at our scale is
  // negligible.
  if (opts.state) {
    rows = rows.filter((r) => {
      const s = getStateFromMetadata(r.metadata);
      return s ? s.toLowerCase() === opts.state!.toLowerCase() : false;
    });
  }

  return rows;
}

// Re-export for callers that want to derive flags client-side
export { getCountryFromPhone };

export async function getLeadById(
  tenantId: string,
  leadId: string,
): Promise<Lead | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select(
      "id, name, whatsapp_number, email, intent, status, notes, created_at, conversation_id, source, metadata",
    )
    .eq("tenant_id", tenantId)
    .eq("id", leadId)
    .maybeSingle();
  return (data as Lead | null) ?? null;
}

export type LeadCallHistoryItem = {
  conversation_id: string;
  title: string;
  started_at: string;
  duration_secs: number;
  call_successful: string | null;
  direction: string | null;
  transcript: string | null;
};

/**
 * Past voice calls related to a lead. We look in brain.episodes where
 * metadata.lead_id matches. Both Sandra and Rebecca write here; sorted newest
 * first.
 */
export async function getLeadCallHistory(
  leadId: string,
  limit = 10,
): Promise<LeadCallHistoryItem[]> {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const params = new URLSearchParams({
    select: "title,metadata,created_at",
    order: "created_at.desc",
    limit: String(limit),
    "metadata->>lead_id": `eq.${leadId}`,
    source: "eq.elevenlabs",
  });
  const res = await fetch(`${url}/rest/v1/episodes?${params}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Accept-Profile": "brain",
    },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as Array<{
    title: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;
  return rows.map((r) => {
    const m = r.metadata ?? {};
    return {
      conversation_id: String(m.conversation_id ?? ""),
      title: r.title,
      started_at: String(m.started_at ?? r.created_at),
      duration_secs: Number(m.duration_secs ?? 0),
      call_successful: m.call_successful ? String(m.call_successful) : null,
      direction: m.direction ? String(m.direction) : null,
      transcript: m.transcript ? String(m.transcript) : null,
    };
  });
}

export async function getLeadIntents(tenantId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("intent")
    .eq("tenant_id", tenantId)
    .not("intent", "is", null);
  const set = new Set<string>();
  for (const r of (data ?? []) as { intent: string }[]) set.add(r.intent);
  return Array.from(set);
}

/**
 * Distinct cities + verticals found in lead metadata. Used to populate the
 * filter chips on /dashboard/[slug]/leads. Only returns values present in
 * at least 1 lead so we never show a dead filter.
 */
export async function getLeadFacets(
  tenantId: string,
): Promise<{
  cities: string[];
  verticals: string[];
  sources: string[];
  countries: string[];   // ISO alpha-2 codes for countries present in current leads
  states: Record<string, string[]>; // country code → sorted distinct states present
}> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("source, whatsapp_number, metadata")
    .eq("tenant_id", tenantId)
    .limit(2000);

  const cities = new Set<string>();
  const verticals = new Set<string>();
  const sources = new Set<string>();
  const countries = new Set<string>();
  const statesByCountry: Record<string, Set<string>> = {};

  for (const r of (data ?? []) as {
    source: string | null;
    whatsapp_number: string | null;
    metadata: Record<string, unknown> | null;
  }[]) {
    if (r.source) sources.add(r.source);
    const m = r.metadata ?? {};
    const c = typeof m.city === "string" ? m.city : null;
    const v = typeof m.vertical === "string" ? m.vertical : null;
    if (c) cities.add(c);
    if (v) verticals.add(v);

    const country = getCountryFromPhone(r.whatsapp_number);
    if (country) {
      countries.add(country.code);
      const s = getStateFromMetadata(r.metadata);
      if (s) {
        (statesByCountry[country.code] ??= new Set()).add(s);
      }
    }
  }

  const states: Record<string, string[]> = {};
  for (const [k, set] of Object.entries(statesByCountry)) {
    states[k] = Array.from(set).sort();
  }

  return {
    cities: Array.from(cities).sort(),
    verticals: Array.from(verticals).sort(),
    sources: Array.from(sources).sort(),
    countries: Array.from(countries).sort(),
    states,
  };
}
