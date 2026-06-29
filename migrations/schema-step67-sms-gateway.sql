-- =====================================================================
-- BolivAI — Step 67: Pluggable SMS provider (Twilio OR a PBX/HTTP gateway)
-- =====================================================================
-- The marketing SMS arm was Twilio-only. Many tenants run their own PBX / VoIP
-- SMS gateway (3CX, GoIP, Yeastar, Grandstream, Telnyx, …) that exposes a plain
-- HTTP send API. This adds a per-tenant provider selection:
--   twilio        → reuse the existing tenants.voice_phone_* creds (voice + SMS)
--   http_gateway  → a configurable HTTP request the tenant defines (URL + method
--                   + auth header + a body template with {to}/{from}/{text})
--
-- gateway_auth_header is a SECRET (carries a bearer/api key), so the whole row is
-- service-role only — NO member RLS policy. The settings UI reads a MASKED view
-- server-side (the auth header is never returned to the client).
-- =====================================================================

create table if not exists public.tenant_sms_settings (
  tenant_id            uuid primary key references public.tenants(id) on delete cascade,
  provider             text not null default 'twilio'
                         check (provider in ('twilio','http_gateway')),
  gateway_url          text,
  gateway_method       text not null default 'POST' check (gateway_method in ('GET','POST')),
  gateway_content_type text not null default 'json' check (gateway_content_type in ('json','form')),
  gateway_body_template text,
  gateway_from         text,
  gateway_auth_header  text,   -- secret: "Authorization: Bearer …" / "X-API-Key: …"
  updated_at           timestamptz not null default now()
);

drop trigger if exists trg_tenant_sms_settings_updated on public.tenant_sms_settings;
create trigger trg_tenant_sms_settings_updated before update on public.tenant_sms_settings
  for each row execute function set_updated_at();

-- RLS — no member policy (the row carries an auth secret). Service role only;
-- the settings UI reads a masked view via the service client server-side.
alter table public.tenant_sms_settings enable row level security;
revoke all on public.tenant_sms_settings from anon, authenticated;
grant all on public.tenant_sms_settings to service_role;
