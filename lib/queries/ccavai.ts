import { createClient } from "@/lib/supabase/server";

export type CcavaiDraft = {
  id: string;
  run_id: string;
  generated_at: string;
  platform: "linkedin" | "instagram" | "facebook" | "x";
  story_title: string;
  story_url: string | null;
  story_source: string | null;
  story_summary: string | null;
  draft_title: string | null;
  draft_body: string;
  draft_hashtags: string[] | null;
  visual_prompt: string | null;
  image_prompt: string | null;
  image_url: string | null;
  subject_image_url: string | null;
  branded_headline: string | null;
  accent_phrases: string[] | null;
  status: "pending" | "approved" | "rejected" | "posted" | "archived";
  decided_at: string | null;
  decided_notes: string | null;
  posted_url: string | null;
};

export type CcavaiRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  drafts_created: number;
  stories_picked: number;
};

export type CcavaiStats = {
  drafts_generated: number;
  pending_review: number;
  approved: number;
  posted: number;
  rejected: number;
  last_run_at: string | null;
  window_start: string;
};

export async function listCcavaiDrafts(opts: {
  status?: CcavaiDraft["status"];
  limit?: number;
} = {}): Promise<CcavaiDraft[]> {
  const supabase = await createClient();
  // Deliberately DO NOT select image_url or subject_image_url here — each
  // is a ~2MB base64 data URI; inlining 9+ rows blows Vercel's 4.5MB
  // serverless response cap. The browser pulls images lazily from
  // /api/ccavai/drafts/[id]/image instead.
  let q = supabase
    .from("ccavai_drafts")
    .select(
      "id, run_id, generated_at, platform, story_title, story_url, story_source, story_summary, draft_title, draft_body, draft_hashtags, visual_prompt, image_prompt, branded_headline, accent_phrases, status, decided_at, decided_notes, posted_url",
    )
    .order("generated_at", { ascending: false })
    .limit(opts.limit ?? 200);

  if (opts.status) q = q.eq("status", opts.status);

  const { data } = await q;
  // Synthesize the URL fields so the card components can treat them as
  // present without having to know about the separate /image route.
  return (data ?? []).map((row) => ({
    ...(row as Omit<CcavaiDraft, "image_url" | "subject_image_url">),
    image_url: `/api/ccavai/drafts/${(row as { id: string }).id}/image`,
    subject_image_url: `/api/ccavai/drafts/${(row as { id: string }).id}/image?variant=subject`,
  })) as CcavaiDraft[];
}

export async function listCcavaiRuns(limit = 30): Promise<CcavaiRun[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ccavai_runs")
    .select("id, started_at, finished_at, status, drafts_created, stories_picked")
    .order("started_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as CcavaiRun[];
}

export async function getCcavaiStats(
  window: "today" | "week" | "month" | "7d" | "30d" = "today",
): Promise<CcavaiStats | null> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("ccavai_stats", { p_window: window });
  const row = Array.isArray(data) ? data[0] : data;
  return (row ?? null) as CcavaiStats | null;
}
