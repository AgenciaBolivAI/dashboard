import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { MarketingChannel } from "@/lib/marketing/channels";
import type { AudienceFilter } from "@/lib/marketing/audience";

export type BroadcastStatus = "draft" | "approved" | "running" | "paused" | "done" | "cancelled";

export type MarketingCampaignRow = {
  id: string;
  title: string;
  goal: string | null;
  channel: MarketingChannel;
  kind: "broadcast" | "drip";
  subject: string | null;
  body: string | null;
  audience: AudienceFilter;
  status: BroadcastStatus;
  budget_credits: number | null;
  spent_credits: number;
  scheduled_at: string | null;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
};

/** All broadcast campaigns for a tenant (RLS-scoped member read). */
export async function listBroadcasts(tenantId: string): Promise<MarketingCampaignRow[]> {
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { data } = await supabase
    .from("marketing_campaigns")
    .select(
      "id, title, goal, channel, kind, subject, body, audience, status, budget_credits, spent_credits, scheduled_at, total_recipients, sent_count, failed_count, created_at",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []) as MarketingCampaignRow[];
}

export type LeadFormField = {
  key: "name" | "email" | "phone" | "message";
  label: string;
  type: "text" | "email" | "tel" | "textarea";
  required: boolean;
  enabled: boolean;
};

export type LeadFormRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  fields: LeadFormField[];
  success_message: string | null;
  redirect_url: string | null;
  status: "active" | "disabled";
  submit_count: number;
  created_at: string;
};

/** All lead-capture forms for a tenant (RLS-scoped member read). */
export async function listLeadForms(tenantId: string): Promise<LeadFormRow[]> {
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { data } = await supabase
    .from("lead_forms")
    .select(
      "id, slug, title, description, fields, success_message, redirect_url, status, submit_count, created_at",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []) as LeadFormRow[];
}
