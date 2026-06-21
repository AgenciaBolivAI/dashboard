import { createClient } from "@/lib/supabase/server";

export type CampaignStatus = "draft" | "approved" | "running" | "paused" | "done" | "cancelled";
export type StepKind = "aima_scrape" | "sandra_calls" | "report" | "wait";
export type StepStatus = "pending" | "running" | "done" | "failed" | "skipped";

export type Campaign = {
  id: string;
  tenant_id: string;
  title: string;
  goal: string | null;
  status: CampaignStatus;
  budget_credits: number | null;
  spent_credits: number;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignStep = {
  id: string;
  campaign_id: string;
  seq: number;
  kind: StepKind;
  params: Record<string, unknown>;
  scheduled_at: string | null;
  status: StepStatus;
  result: Record<string, unknown> | null;
  completed_at: string | null;
};

const CAMPAIGN_COLS =
  "id, tenant_id, title, goal, status, budget_credits, spent_credits, approved_at, created_at, updated_at";
const STEP_COLS =
  "id, campaign_id, seq, kind, params, scheduled_at, status, result, completed_at";

export async function listCampaigns(tenantId: string, limit = 50): Promise<Campaign[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select(CAMPAIGN_COLS)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Campaign[];
}

export type CampaignWithSteps = { campaign: Campaign; steps: CampaignStep[] };

/** Campaigns + their steps for the list page (2 queries, grouped in JS). */
export async function listCampaignsWithSteps(tenantId: string, limit = 50): Promise<CampaignWithSteps[]> {
  const supabase = await createClient();
  const campaigns = await listCampaigns(tenantId, limit);
  if (campaigns.length === 0) return [];
  const { data: stepData } = await supabase
    .from("campaign_steps")
    .select(STEP_COLS)
    .eq("tenant_id", tenantId)
    .in("campaign_id", campaigns.map((c) => c.id))
    .order("seq", { ascending: true });
  const byCampaign = new Map<string, CampaignStep[]>();
  for (const s of (stepData ?? []) as CampaignStep[]) {
    const arr = byCampaign.get(s.campaign_id) ?? [];
    arr.push(s);
    byCampaign.set(s.campaign_id, arr);
  }
  return campaigns.map((campaign) => ({ campaign, steps: byCampaign.get(campaign.id) ?? [] }));
}

export async function getCampaign(
  tenantId: string,
  campaignId: string,
): Promise<{ campaign: Campaign; steps: CampaignStep[] } | null> {
  const supabase = await createClient();
  const [{ data: c }, { data: steps }] = await Promise.all([
    supabase.from("campaigns").select(CAMPAIGN_COLS).eq("id", campaignId).eq("tenant_id", tenantId).maybeSingle(),
    supabase
      .from("campaign_steps")
      .select(STEP_COLS)
      .eq("campaign_id", campaignId)
      .eq("tenant_id", tenantId)
      .order("seq", { ascending: true }),
  ]);
  if (!c) return null;
  return { campaign: c as Campaign, steps: (steps ?? []) as CampaignStep[] };
}
