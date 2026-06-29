import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type ProspectResearchRow = {
  status: "queued" | "running" | "done" | "failed";
  summary: string | null;
  structured: {
    headline?: string;
    industry?: string;
    company_size?: string;
    key_people?: Array<{ name?: string; role?: string }>;
    talking_points?: string[];
    website?: string;
  } | null;
  sources: Array<{ title: string; url: string }> | null;
  error: string | null;
  generated_at: string | null;
};

/** The current research for a lead/customer (RLS-scoped member read). */
export async function getProspectResearch(
  tenantId: string,
  kind: "lead" | "customer",
  subjectId: string,
): Promise<ProspectResearchRow | null> {
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { data } = await supabase
    .from("prospect_research")
    .select("status, summary, structured, sources, error, generated_at")
    .eq("tenant_id", tenantId)
    .eq("subject_kind", kind)
    .eq("subject_id", subjectId)
    .maybeSingle();
  return (data as ProspectResearchRow | null) ?? null;
}

/** Which of the given subjects already have a completed research brief — used to
 * show a "researched" indicator in the leads/customers lists. RLS member read. */
export async function getResearchedSubjectIds(
  tenantId: string,
  kind: "lead" | "customer",
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { data } = await supabase
    .from("prospect_research")
    .select("subject_id")
    .eq("tenant_id", tenantId)
    .eq("subject_kind", kind)
    .eq("status", "done")
    .in("subject_id", ids);
  return ((data ?? []) as Array<{ subject_id: string }>).map((r) => r.subject_id);
}

export type ConversationAnalysisRow = {
  status: "queued" | "running" | "done" | "failed";
  sentiment: "positive" | "neutral" | "negative" | null;
  score: number | null;
  summary: string | null;
  signals: { buying_intent?: string; objections?: string[]; at_risk?: boolean; next_best_action?: string } | null;
  generated_at: string | null;
};

/** The current sentiment analysis for a conversation (RLS-scoped member read). */
export async function getConversationAnalysis(
  tenantId: string,
  conversationId: string,
): Promise<ConversationAnalysisRow | null> {
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { data } = await supabase
    .from("conversation_analysis")
    .select("status, sentiment, score, summary, signals, generated_at")
    .eq("tenant_id", tenantId)
    .eq("conversation_id", conversationId)
    .maybeSingle();
  return (data as ConversationAnalysisRow | null) ?? null;
}

export type ProspectSettings = {
  auto_research_enabled: boolean;
  auto_sources: string[];
  daily_cap: number;
  sentiment_auto_on_handoff: boolean;
};

export const PROSPECT_SETTINGS_DEFAULTS: ProspectSettings = {
  auto_research_enabled: true,
  auto_sources: ["form", "whatsapp", "voice", "meta"],
  daily_cap: 25,
  sentiment_auto_on_handoff: true,
};

/**
 * Tenant auto-research/sentiment settings. prospect_settings is service-role only
 * (it gates spend), so this reads via the service client — call ONLY from a page
 * already gated to the tenant's members. Missing row → sensible defaults.
 */
export async function getProspectSettings(tenantId: string): Promise<ProspectSettings> {
  const svc = createServiceClient() as unknown as SupabaseClient;
  const { data } = await svc
    .from("prospect_settings")
    .select("auto_research_enabled, auto_sources, daily_cap, sentiment_auto_on_handoff")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const s = data as Partial<ProspectSettings> | null;
  if (!s) return { ...PROSPECT_SETTINGS_DEFAULTS };
  return {
    auto_research_enabled: s.auto_research_enabled ?? PROSPECT_SETTINGS_DEFAULTS.auto_research_enabled,
    auto_sources: s.auto_sources ?? [...PROSPECT_SETTINGS_DEFAULTS.auto_sources],
    daily_cap: s.daily_cap ?? PROSPECT_SETTINGS_DEFAULTS.daily_cap,
    sentiment_auto_on_handoff: s.sentiment_auto_on_handoff ?? PROSPECT_SETTINGS_DEFAULTS.sentiment_auto_on_handoff,
  };
}
