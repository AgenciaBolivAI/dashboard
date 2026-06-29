-- =====================================================================
-- BolivAI — Step 64: Lead-capture forms — P2
-- =====================================================================
-- A public, hosted form (no auth) the tenant embeds/links anywhere → a new row
-- in `leads` (source='form:<slug>'). The smallest, most self-contained slice of
-- the marketing layer: zero new send infrastructure, reuses the lead pipeline.
--
--   lead_forms   one form per row. `slug` is an unguessable public id (the only
--                thing exposed at /f/<slug>). `fields` is the rendered field
--                config (which of name/email/phone/message are shown + required).
--
-- The public form page + submit endpoint read/write via the SERVICE role
-- (same pattern as the Meta webhook) — anon never touches the table directly, so
-- there is intentionally NO anon grant + NO anon policy here.
-- =====================================================================

create table if not exists public.lead_forms (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  slug            text not null unique,        -- unguessable public id
  title           text not null,
  description     text,
  fields          jsonb not null default '[]'::jsonb,  -- [{key,label,type,required,enabled}]
  success_message text,
  redirect_url    text,
  status          text not null default 'active' check (status in ('active','disabled')),
  submit_count    integer not null default 0,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_lead_forms_tenant
  on public.lead_forms (tenant_id, created_at desc);

drop trigger if exists trg_lead_forms_updated on public.lead_forms;
create trigger trg_lead_forms_updated before update on public.lead_forms
  for each row execute function set_updated_at();

-- =====================================================================
-- RLS — members READ their tenant's forms; writes via service role. The public
-- form page reads via the service client server-side, so anon gets NO access.
-- =====================================================================
alter table public.lead_forms enable row level security;

drop policy if exists "lead_forms_member_select" on public.lead_forms;
create policy "lead_forms_member_select" on public.lead_forms
  for select to authenticated using (public.is_member_of(tenant_id));

revoke insert, update, delete, truncate on public.lead_forms from anon, authenticated;
revoke select on public.lead_forms from anon;
grant select on public.lead_forms to authenticated;
grant all on public.lead_forms to service_role;

-- Atomic submission counter bump (called by the public submit route, service role).
create or replace function public.increment_form_submit_count(p_form_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.lead_forms set submit_count = submit_count + 1 where id = p_form_id;
$$;
revoke all on function public.increment_form_submit_count(uuid) from public, anon, authenticated;
grant execute on function public.increment_form_submit_count(uuid) to service_role;
