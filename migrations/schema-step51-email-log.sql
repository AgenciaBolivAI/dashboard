-- =====================================================================
-- BolivAI — Step 51: email_log (BOLIV outbound email feature).
-- Audit trail of every email BOLIV sends on a tenant's behalf (from the
-- tenant's OWN Gmail/SMTP). Also the source of truth for the per-tenant
-- daily rate limit. Tenant-scoped RLS; writes via service role only.
-- =====================================================================
create table if not exists public.email_log (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  actor_user_id   uuid,
  recipient_type  text not null,                 -- 'customer' | 'lead'
  recipient_id    uuid,
  to_email        text not null,
  subject         text not null,
  template        text,                          -- e.g. 'cold_outreach' (null = freeform)
  sender_kind     text,                          -- 'gmail' | 'smtp'
  from_email      text,
  status          text not null default 'sent',  -- 'sent' | 'failed'
  error           text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_email_log_tenant_time
  on public.email_log (tenant_id, created_at desc);
create index if not exists idx_email_log_recipient
  on public.email_log (tenant_id, recipient_id, created_at desc)
  where recipient_id is not null;

alter table public.email_log enable row level security;

-- Members of the tenant can read their email history; nobody writes via the
-- anon/authenticated key (BOLIV writes through the service role).
drop policy if exists email_log_member_select on public.email_log;
create policy email_log_member_select on public.email_log
  for select to authenticated using (public.is_member_of(tenant_id));

revoke insert, update, delete on public.email_log from anon, authenticated;
grant select on public.email_log to authenticated;
grant all on public.email_log to service_role;
