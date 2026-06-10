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
  limit?: number;
};

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

  const { data } = await q;
  return (data ?? []) as Lead[];
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
): Promise<{ cities: string[]; verticals: string[]; sources: string[] }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leads")
    .select("source, metadata")
    .eq("tenant_id", tenantId)
    .limit(2000);

  const cities = new Set<string>();
  const verticals = new Set<string>();
  const sources = new Set<string>();
  for (const r of (data ?? []) as { source: string | null; metadata: Record<string, unknown> | null }[]) {
    if (r.source) sources.add(r.source);
    const m = r.metadata ?? {};
    const c = typeof m.city === "string" ? m.city : null;
    const v = typeof m.vertical === "string" ? m.vertical : null;
    if (c) cities.add(c);
    if (v) verticals.add(v);
  }
  return {
    cities: Array.from(cities).sort(),
    verticals: Array.from(verticals).sort(),
    sources: Array.from(sources).sort(),
  };
}
