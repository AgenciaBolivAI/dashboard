-- =====================================================================
-- BolivAI — VIRA video shorts agent
-- =====================================================================
-- VIRA = Video Intelligence Reel Agent
--
-- Customer pastes a video URL (YouTube, Vimeo, or direct mp4). VIRA
-- downloads it, transcribes with Whisper, reasons over the transcript
-- + audio energy + speaker turns to identify clip-worthy moments, then
-- cuts and renders short clips (9:16 / 1:1 / 16:9) with optional
-- subtitles and watermark.
--
-- Billing model:
--   video.shorts.input_minute   — 10 cr/min ($0.10) for transcribe + analysis
--   video.shorts.output_second  —  2 cr/sec ($0.02) for cutting + rendering
--
-- Example: 10-min YouTube → 3 × 30s clips = 100 cr (input) + 180 cr (output)
--          = 280 cr ($2.80) total
--          Our actual cost: ~$0.20 Whisper + ~$0.10 GPT + ~$0.30 ffmpeg
--          = ~$0.60 → margin ≈ 79%
--
-- Idempotent. Safe to re-run.
-- =====================================================================

-- ── Per-tenant VIRA settings ─────────────────────────────────────────
create table if not exists public.vira_settings (
  tenant_id           uuid primary key references public.tenants(id) on delete cascade,
  enabled             boolean not null default false,
  -- Clip duration bounds
  min_clip_seconds    int not null default 15
                        check (min_clip_seconds >= 5 and min_clip_seconds <= 120),
  max_clip_seconds    int not null default 60
                        check (max_clip_seconds >= 10 and max_clip_seconds <= 180),
  -- How many clips to extract per video
  clips_per_video     int not null default 3
                        check (clips_per_video >= 1 and clips_per_video <= 10),
  -- Output format
  output_format       text not null default '9:16'
                        check (output_format in ('9:16', '1:1', '16:9')),
  -- Reasoning style — guides which moments VIRA prioritizes
  clip_style          text not null default 'high_energy'
                        check (clip_style in (
                          'high_energy',       -- punchy hooks, audience reactions
                          'educational',       -- explanations, definitions, tutorials
                          'storytelling',      -- narrative arcs, character moments
                          'qa_highlights'      -- question/answer pairs, expert answers
                        )),
  -- Visuals
  add_subtitles       boolean not null default true,
  subtitle_style      text not null default 'bold_centered'
                        check (subtitle_style in ('bold_centered', 'minimal_bottom', 'word_pop')),
  add_watermark       boolean not null default false,
  watermark_text      text,
  -- Soft caps so a bad video URL can't drain the account
  max_input_minutes   int not null default 60
                        check (max_input_minutes >= 1 and max_input_minutes <= 240),
  -- Auto-publish to socials (future: integrate with CCAVAI/LinkedIn/IG/FB)
  auto_post_drafts    boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create or replace function public.vira_settings_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_vira_settings_updated on public.vira_settings;
create trigger trg_vira_settings_updated
  before update on public.vira_settings
  for each row execute function public.vira_settings_set_updated_at();

-- Auto-seed a row for every existing tenant
insert into public.vira_settings (tenant_id)
select t.id from public.tenants t
where not exists (select 1 from public.vira_settings v where v.tenant_id = t.id)
on conflict (tenant_id) do nothing;

-- ── VIRA job queue (one row per "process this video" request) ───────
create table if not exists public.vira_jobs (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  source_url          text not null,
  source_type         text,                              -- 'youtube' | 'vimeo' | 'mp4_url' | 'unknown'
  status              text not null default 'pending'
                        check (status in (
                          'pending',         -- queued, waiting for worker
                          'downloading',     -- pulling video from source
                          'transcribing',    -- Whisper running
                          'analyzing',       -- LLM picking moments
                          'clipping',        -- ffmpeg cutting + rendering
                          'done',            -- all clips ready
                          'failed',          -- something blew up
                          'cancelled'        -- user aborted
                        )),
  duration_seconds    int,                               -- detected after download
  language            text,                              -- detected by Whisper
  transcript          text,                              -- full transcript
  reasoning_summary   text,                              -- LLM's high-level rationale
  error               text,
  -- Snapshot of settings at the time of submission (so changing settings
  -- mid-run doesn't reshape a job in flight)
  settings_snapshot   jsonb not null default '{}',
  metadata            jsonb not null default '{}',
  created_at          timestamptz not null default now(),
  started_at          timestamptz,
  finished_at         timestamptz
);

create index if not exists idx_vira_jobs_tenant_created
  on public.vira_jobs (tenant_id, created_at desc);
create index if not exists idx_vira_jobs_status_pending
  on public.vira_jobs (status) where status in ('pending','downloading','transcribing','analyzing','clipping');

-- ── Output clips (one row per generated short) ──────────────────────
create table if not exists public.vira_clips (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid not null references public.vira_jobs(id) on delete cascade,
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  -- Ordering within the job (1-based)
  clip_index          int not null,
  title               text,
  reasoning           text,                              -- WHY VIRA picked this moment
  start_seconds       numeric(10,3) not null,
  end_seconds         numeric(10,3) not null,
  -- Output assets (Supabase Storage URLs)
  output_url          text,
  thumbnail_url       text,
  subtitle_track_url  text,                              -- optional .vtt file
  -- Transcript snippet for this clip (for previewing in dashboard)
  transcript_excerpt  text,
  metadata            jsonb not null default '{}',
  created_at          timestamptz not null default now(),
  unique (job_id, clip_index),
  check (end_seconds > start_seconds)
);

create index if not exists idx_vira_clips_tenant_created
  on public.vira_clips (tenant_id, created_at desc);

-- Computed: duration is end - start
create or replace function public.vira_clip_duration_seconds(c public.vira_clips)
returns numeric language sql immutable as $$
  select c.end_seconds - c.start_seconds
$$;

-- ── RLS lockdown (same pattern as everywhere else) ──────────────────
alter table public.vira_settings enable row level security;
alter table public.vira_jobs     enable row level security;
alter table public.vira_clips    enable row level security;

drop policy if exists "vira_settings_member_select" on public.vira_settings;
create policy "vira_settings_member_select"
  on public.vira_settings for select
  to authenticated
  using (
    exists (select 1 from public.dashboard_users du
            where du.user_id = auth.uid() and du.tenant_id = vira_settings.tenant_id)
    or public.is_bolivai_admin()
  );
drop policy if exists "vira_settings_admin_update" on public.vira_settings;
create policy "vira_settings_admin_update"
  on public.vira_settings for update
  to authenticated
  using (
    exists (select 1 from public.dashboard_users du
            where du.user_id = auth.uid() and du.tenant_id = vira_settings.tenant_id
              and du.role in ('owner','admin'))
    or public.is_bolivai_admin()
  );

drop policy if exists "vira_jobs_member_select" on public.vira_jobs;
create policy "vira_jobs_member_select"
  on public.vira_jobs for select
  to authenticated
  using (
    exists (select 1 from public.dashboard_users du
            where du.user_id = auth.uid() and du.tenant_id = vira_jobs.tenant_id)
    or public.is_bolivai_admin()
  );

drop policy if exists "vira_clips_member_select" on public.vira_clips;
create policy "vira_clips_member_select"
  on public.vira_clips for select
  to authenticated
  using (
    exists (select 1 from public.dashboard_users du
            where du.user_id = auth.uid() and du.tenant_id = vira_clips.tenant_id)
    or public.is_bolivai_admin()
  );

-- Revoke broad-stroke writes; service_role keeps full
revoke insert, update, delete, truncate on public.vira_settings from anon, authenticated;
revoke insert, update, delete, truncate on public.vira_jobs     from anon, authenticated;
revoke insert, update, delete, truncate on public.vira_clips    from anon, authenticated;
-- authenticated keeps UPDATE on vira_settings via the policy
grant update on public.vira_settings to authenticated;
grant all on public.vira_settings to service_role;
grant all on public.vira_jobs     to service_role;
grant all on public.vira_clips    to service_role;

-- ── Credit pricing rows ──────────────────────────────────────────────
insert into public.credit_pricing
  (action_key, credits_per_unit, unit_label, description, cost_per_unit_micros, vendor_cost_micros)
values
  ('video.shorts.input_minute',  10, 'minute',
   'VIRA processing per minute of source video (Whisper transcription + GPT analysis).',
   12000,
   jsonb_build_object('openai', 12000)),
  ('video.shorts.output_second', 2,  'second',
   'VIRA output per second of rendered clip (ffmpeg encode + Supabase Storage).',
   5000,
   jsonb_build_object('infra', 5000))
on conflict (action_key) do update set
  credits_per_unit = excluded.credits_per_unit,
  description = excluded.description,
  cost_per_unit_micros = excluded.cost_per_unit_micros,
  vendor_cost_micros = excluded.vendor_cost_micros,
  updated_at = now();
