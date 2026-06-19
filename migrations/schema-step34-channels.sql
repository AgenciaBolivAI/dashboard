-- =====================================================================
-- BolivAI — Step 34: Channel-aware platform (Instagram + Messenger ready)
-- =====================================================================
-- Today users/conversations/chat_history assume ONE WhatsApp channel per
-- tenant (users unique (tenant_id, whatsapp_number), routing by Evolution
-- instance). This makes the data model channel-aware so a tenant can run
-- WhatsApp + Instagram + Facebook Messenger at once.
--
-- ADDITIVE + back-compatible: existing rows default to channel='whatsapp',
-- the old unique (tenant_id, whatsapp_number) stays so the live WhatsApp n8n
-- flow (on conflict (tenant_id, whatsapp_number)) keeps working unchanged.
-- The new IG/Messenger handlers will key on (tenant_id, channel, channel_user_id).
--
-- New routing model: inbound (channel, external_id) -> tenant_channels.tenant_id,
-- replacing "evolution instance -> tenant" once the new handlers ship.
-- Idempotent.
-- =====================================================================

-- ── Channel registry: one row per connected channel per tenant ──────
create table if not exists public.tenant_channels (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  channel     text not null check (channel in ('whatsapp','instagram','facebook_messenger')),
  -- The provider routing key: WhatsApp phone_number_id, FB page_id, or IG id.
  external_id text not null,
  -- Provider credentials/config (page access token, ig id, verify token, etc.).
  -- SENSITIVE: never expose. Not in the analytics-assistant QUERYABLE allowlist.
  config      jsonb not null default '{}'::jsonb,
  status      text not null default 'active' check (status in ('active','paused','disconnected')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- A given provider account maps to exactly one tenant.
  unique (channel, external_id)
);
create index if not exists idx_tenant_channels_tenant on public.tenant_channels (tenant_id);
create index if not exists idx_tenant_channels_route on public.tenant_channels (channel, external_id) where status = 'active';

drop trigger if exists trg_tenant_channels_updated on public.tenant_channels;
create trigger trg_tenant_channels_updated
  before update on public.tenant_channels
  for each row execute function set_updated_at();

-- ── users: channel-aware identity ───────────────────────────────────
alter table public.users add column if not exists channel text not null default 'whatsapp';
alter table public.users add column if not exists channel_user_id text;        -- external sender id (phone / PSID / IGSID)
-- IG/Messenger users have no whatsapp_number → make it optional.
alter table public.users alter column whatsapp_number drop not null;
-- Backfill the generic id for existing WhatsApp contacts.
update public.users set channel_user_id = whatsapp_number
  where channel_user_id is null and whatsapp_number is not null;
-- New per-channel uniqueness (additive; old (tenant_id, whatsapp_number) stays).
create unique index if not exists ux_users_tenant_channel_extid
  on public.users (tenant_id, channel, channel_user_id) where channel_user_id is not null;

-- ── conversations + chat_history: tag the channel ───────────────────
alter table public.conversations add column if not exists channel text not null default 'whatsapp';
alter table public.chat_history   add column if not exists channel text not null default 'whatsapp';
-- Generic provider message id (evolution_message_id stays for back-compat).
alter table public.chat_history   add column if not exists provider_message_id text;
create index if not exists idx_conversations_channel on public.conversations (tenant_id, channel);

-- ── RLS — members read their tenant's channels; writes via service role ─
alter table public.tenant_channels enable row level security;

drop policy if exists "tenant_channels_member_select" on public.tenant_channels;
create policy "tenant_channels_member_select" on public.tenant_channels
  for select to authenticated using (public.is_member_of(tenant_id));

drop policy if exists "tenant_channels_admin_manage" on public.tenant_channels;
create policy "tenant_channels_admin_manage" on public.tenant_channels
  for all to authenticated using (public.is_admin_of(tenant_id)) with check (public.is_admin_of(tenant_id));

revoke insert, update, delete, truncate on public.tenant_channels from anon, authenticated;
grant select on public.tenant_channels to authenticated;
grant all on public.tenant_channels to service_role;

-- ── Backfill: register existing Evolution WhatsApp channels ─────────
-- So the new (channel, external_id) router can resolve current tenants. Uses
-- the Evolution instance as the routing key until numbers move to Cloud API.
insert into public.tenant_channels (tenant_id, channel, external_id, config, status)
select t.id, 'whatsapp', t.gateway_config->>'instance',
       jsonb_build_object('gateway','evolution','instance', t.gateway_config->>'instance'),
       case when t.status = 'active' then 'active' else 'paused' end
from public.tenants t
where t.gateway = 'evolution'
  and coalesce(t.gateway_config->>'instance','') <> ''
on conflict (channel, external_id) do nothing;
