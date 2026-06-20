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
  search?: string;    // matches name OR phone OR email, case-insensitive partial
  offset?: number;    // pagination window start (0-based); pairs with limit
  limit?: number;
};

import { COUNTRY_BY_CODE, getCountryFromPhone, getStateFromMetadata } from "@/lib/leads-geo";

const LEAD_COLS =
  "id, name, whatsapp_number, email, intent, status, notes, created_at, conversation_id, source, metadata";

/**
 * Paginated lead listing. Returns the requested window plus the TOTAL count of
 * leads matching the filters (via PostgREST `count: exact`), so the UI can show
 * "showing 1–50 of 700" and paginate through the whole set — it previously
 * hard-capped at 500 rows with no count.
 */
export async function listLeads(
  tenantId: string,
  opts: LeadFilters = {},
): Promise<{ rows: Lead[]; total: number }> {
  const supabase = await createClient();
  let q = supabase
    .from("leads")
    .select(LEAD_COLS, { count: "exact" })
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  if (opts.status) q = q.eq("status", opts.status);
  if (opts.intent) q = q.eq("intent", opts.intent);
  if (opts.source) q = q.eq("source", opts.source);
  if (opts.search) {
    // PostgREST .or() — commas separate conditions; escape them in input.
    // Phone matches strip non-digits so "+1 (786)" finds "1786...".
    const s = opts.search.replace(/[,()]/g, " ").trim();
    if (s) {
      const digits = s.replace(/\D/g, "");
      const ors = [`name.ilike.%${s}%`, `email.ilike.%${s}%`];
      if (digits.length >= 3) ors.push(`whatsapp_number.ilike.%${digits}%`);
      q = q.or(ors.join(","));
    }
  }
  // City + vertical live in metadata (populated by AIMA's Google Maps run).
  // Postgres JSONB → contains operator. Single-key filter is fast even without index at our scale.
  if (opts.city) q = q.contains("metadata", { city: opts.city });
  if (opts.vertical) q = q.contains("metadata", { vertical: opts.vertical });

  // Country filter — derived from the phone prefix. Postgres doesn't store
  // the country directly, so we filter by `whatsapp_number LIKE prefix%`.
  if (opts.country) {
    const c = COUNTRY_BY_CODE[opts.country];
    if (c) q = q.like("whatsapp_number", `${c.prefix}%`);
  }

  // State filters server-side across all three possible JSONB keys (state /
  // region / administrative_area_level_1) so the count + pagination stay
  // accurate. It used to filter client-side AFTER the fetch, so it only ever
  // saw the first page of rows.
  if (opts.state) {
    const s = opts.state.replace(/[,()]/g, " ").trim();
    if (s) {
      q = q.or(
        `metadata->>state.ilike.${s},metadata->>region.ilike.${s},metadata->>administrative_area_level_1.ilike.${s}`,
      );
    }
  }

  // Pagination window. Non-paginated callers (CSV export) pass only `limit`.
  if (opts.offset != null) {
    const from = opts.offset;
    const to = from + (opts.limit ?? 50) - 1;
    q = q.range(from, to);
  } else {
    q = q.limit(opts.limit ?? 500);
  }

  const { data, count } = await q;
  return { rows: (data ?? []) as Lead[], total: count ?? 0 };
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
    .select(LEAD_COLS)
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
