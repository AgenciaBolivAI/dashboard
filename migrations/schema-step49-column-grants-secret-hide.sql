-- =====================================================================
-- BolivAI — Step 49: ACTUALLY hide member-readable secret columns.
-- step47 used `revoke select (col)` but the roles still hold TABLE-level SELECT,
-- which overrides a column-level revoke (Postgres has no "deny one column").
-- The correct pattern: revoke table SELECT, then re-grant SELECT on every column
-- EXCEPT the secret ones. Done dynamically so future columns stay readable;
-- only the named secret columns are withheld.
--   tenants.voice_phone_auth_token  (Twilio auth token)
--   tenant_channels.config          (Meta page/IG access tokens)
-- RLS still governs WHICH ROWS each role sees; this governs WHICH COLUMNS.
-- =====================================================================
do $do$
declare cols text;
begin
  -- tenants: re-grant all columns except the Twilio auth token
  select string_agg(quote_ident(column_name), ', ')
    into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'tenants'
    and column_name <> 'voice_phone_auth_token';
  execute 'revoke select on public.tenants from anon, authenticated';
  execute 'grant select (' || cols || ') on public.tenants to anon, authenticated';

  -- tenant_channels: re-grant all columns except the secret config (page tokens)
  select string_agg(quote_ident(column_name), ', ')
    into cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'tenant_channels'
    and column_name <> 'config';
  execute 'revoke select on public.tenant_channels from anon, authenticated';
  execute 'grant select (' || cols || ') on public.tenant_channels to anon, authenticated';
end
$do$;
