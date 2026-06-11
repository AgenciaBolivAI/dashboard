import { createClient } from "@/lib/supabase/server";

export type ViraSettings = {
  tenant_id: string;
  enabled: boolean;
  min_clip_seconds: number;
  max_clip_seconds: number;
  clips_per_video: number;
  output_format: "9:16" | "1:1" | "16:9";
  clip_style: "high_energy" | "educational" | "storytelling" | "qa_highlights";
  add_subtitles: boolean;
  subtitle_style: "bold_centered" | "minimal_bottom" | "word_pop";
  add_watermark: boolean;
  watermark_text: string | null;
  max_input_minutes: number;
  auto_post_drafts: boolean;
  updated_at: string;
};

export type ViraJob = {
  id: string;
  tenant_id: string;
  source_url: string;
  source_type: string | null;
  status:
    | "pending"
    | "downloading"
    | "transcribing"
    | "analyzing"
    | "clipping"
    | "done"
    | "failed"
    | "cancelled";
  duration_seconds: number | null;
  language: string | null;
  reasoning_summary: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export type ViraClip = {
  id: string;
  job_id: string;
  clip_index: number;
  title: string | null;
  reasoning: string | null;
  start_seconds: number;
  end_seconds: number;
  output_url: string | null;
  thumbnail_url: string | null;
  transcript_excerpt: string | null;
  created_at: string;
};

export async function getViraSettings(tenantId: string): Promise<ViraSettings | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vira_settings")
    .select("*")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return (data ?? null) as ViraSettings | null;
}

export async function listViraJobs(tenantId: string, limit = 20): Promise<ViraJob[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vira_jobs")
    .select(
      "id, tenant_id, source_url, source_type, status, duration_seconds, language, reasoning_summary, error, created_at, started_at, finished_at",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as ViraJob[];
}

export async function listViraClipsForJob(jobId: string): Promise<ViraClip[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vira_clips")
    .select(
      "id, job_id, clip_index, title, reasoning, start_seconds, end_seconds, output_url, thumbnail_url, transcript_excerpt, created_at",
    )
    .eq("job_id", jobId)
    .order("clip_index");
  return (data ?? []) as unknown as ViraClip[];
}
