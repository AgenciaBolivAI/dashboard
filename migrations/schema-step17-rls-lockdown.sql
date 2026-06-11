-- =====================================================================
-- BolivAI — RLS lockdown for tables that were missing it
-- =====================================================================
-- Discovered in the 2026-06-10 security audit: 11 tables in public had
-- RLS OFF and full ALL-privileges grants for anon + authenticated. The
-- Supabase anon key is by design exposed in the client bundle as
-- NEXT_PUBLIC_SUPABASE_ANON_KEY, so anyone reading the page source
-- could read or write these tables.
--
-- Worst exposures:
--   aima_settings              → API keys for Apollo, Instantly, Google Maps in plaintext
--   castillo_webhook_secrets   → shared Bearer secret for /api/billing/debit, voice tools, CCAVAI trigger
--   credit_accounts            → tenant balances + stripe_customer_id
--   credit_transactions        → revenue/usage ledger + write access = unlimited fake top-ups
--   credit_pricing             → write access = set every action to 0 cr and use the platform free
--
-- Strategy:
--   1. Enable RLS on all 11 tables.
--   2. Tenant-scoped tables get SELECT policies for members; writes are
--      service_role only (server actions / RPCs already bypass RLS).
--   3. Server-only tables (webhook secrets, invoice sequences, n8n
--      chat histories) get NO policies — only service_role can touch them.
--   4. Single-tenant BolivAI tables (ccavai_*) restrict to bolivai_admins.
--   5. credit_pricing gets public SELECT (it's pricing display data) but
--      writes are service_role only.
--
-- All SECURITY DEFINER RPCs (tenant_balance, debit_credits, credit_topup,
-- ccavai_stats, aima_stats, platform_pnl, etc.) bypass RLS, so the
-- dashboard's existing flows keep working unchanged.
--
-- Idempotent. Safe to re-run.
-- =====================================================================

-- ── 1. Enable RLS everywhere ─────────────────────────────────────────
alter table public.aima_scrape_runs           enable row level security;
alter table public.aima_settings              enable row level security;
alter table public.castillo_webhook_secrets   enable row level security;
alter table public.ccavai_drafts              enable row level security;
alter table public.ccavai_runs                enable row level security;
alter table public.credit_accounts            enable row level security;
alter table public.credit_pricing             enable row level security;
alter table public.credit_transactions        enable row level security;
alter table public.invoice_number_sequence    enable row level security;
alter table public.n8n_chat_histories         enable row level security;
alter table public.sandra_call_queue          enable row level security;

-- ── 2. credit_pricing: public SELECT (read-only), writes service-only
drop policy if exists "credit_pricing_select_all" on public.credit_pricing;
create policy "credit_pricing_select_all"
  on public.credit_pricing for select
  to anon, authenticated
  using (true);

-- ── 3. credit_accounts: tenant members can SELECT theirs; writes via RPCs only
drop policy if exists "credit_accounts_member_select" on public.credit_accounts;
create policy "credit_accounts_member_select"
  on public.credit_accounts for select
  to authenticated
  using (
    exists (
      select 1 from public.dashboard_users du
      where du.user_id = auth.uid()
        and du.tenant_id = credit_accounts.tenant_id
    )
    or public.is_bolivai_admin()
  );

-- ── 4. credit_transactions: members can SELECT theirs; ALL writes via RPCs
drop policy if exists "credit_tx_member_select" on public.credit_transactions;
create policy "credit_tx_member_select"
  on public.credit_transactions for select
  to authenticated
  using (
    exists (
      select 1 from public.dashboard_users du
      where du.user_id = auth.uid()
        and du.tenant_id = credit_transactions.tenant_id
    )
    or public.is_bolivai_admin()
  );

-- ── 5. aima_settings: tenant ADMINS only (it has API keys)
drop policy if exists "aima_settings_admin_select" on public.aima_settings;
create policy "aima_settings_admin_select"
  on public.aima_settings for select
  to authenticated
  using (
    exists (
      select 1 from public.dashboard_users du
      where du.user_id = auth.uid()
        and du.tenant_id = aima_settings.tenant_id
        and du.role in ('owner','admin')
    )
    or public.is_bolivai_admin()
  );
drop policy if exists "aima_settings_admin_update" on public.aima_settings;
create policy "aima_settings_admin_update"
  on public.aima_settings for update
  to authenticated
  using (
    exists (
      select 1 from public.dashboard_users du
      where du.user_id = auth.uid()
        and du.tenant_id = aima_settings.tenant_id
        and du.role in ('owner','admin')
    )
    or public.is_bolivai_admin()
  );

-- ── 6. aima_scrape_runs: tenant members SELECT only
drop policy if exists "aima_runs_member_select" on public.aima_scrape_runs;
create policy "aima_runs_member_select"
  on public.aima_scrape_runs for select
  to authenticated
  using (
    exists (
      select 1 from public.dashboard_users du
      where du.user_id = auth.uid()
        and du.tenant_id = aima_scrape_runs.tenant_id
    )
    or public.is_bolivai_admin()
  );

-- ── 7. sandra_call_queue: tenant members SELECT + operator/admin INSERT/UPDATE/DELETE
drop policy if exists "sandra_queue_member_select" on public.sandra_call_queue;
create policy "sandra_queue_member_select"
  on public.sandra_call_queue for select
  to authenticated
  using (
    exists (
      select 1 from public.dashboard_users du
      where du.user_id = auth.uid()
        and du.tenant_id = sandra_call_queue.tenant_id
    )
    or public.is_bolivai_admin()
  );

-- ── 8. ccavai_drafts + ccavai_runs: BolivAI-only, no tenant_id column,
--      so restrict reads to bolivai_admins. Workflow inserts via
--      service_role bypass RLS.
drop policy if exists "ccavai_drafts_admin_select" on public.ccavai_drafts;
create policy "ccavai_drafts_admin_select"
  on public.ccavai_drafts for select
  to authenticated
  using (public.is_bolivai_admin());
drop policy if exists "ccavai_runs_admin_select" on public.ccavai_runs;
create policy "ccavai_runs_admin_select"
  on public.ccavai_runs for select
  to authenticated
  using (public.is_bolivai_admin());

-- ── 9. Server-only tables: NO policies. service_role bypasses RLS so
--      our routes + n8n keep working; anon + authenticated see nothing.
--   - castillo_webhook_secrets  (the bearer for /api/billing/debit etc.)
--   - invoice_number_sequence    (internal counter)
--   - n8n_chat_histories         (n8n's chat memory)

-- ── 10. Revoke broad-stroke grants — even with RLS on, grants matter
--      for what PostgREST will allow at all. Service_role keeps full
--      access; anon/authenticated drop down to "respect RLS".
revoke insert, update, delete, truncate on public.credit_accounts        from anon, authenticated;
revoke insert, update, delete, truncate on public.credit_transactions    from anon, authenticated;
revoke insert, update, delete, truncate on public.credit_pricing         from anon, authenticated;
revoke insert, update, delete, truncate on public.aima_settings          from anon;       -- authenticated can still UPDATE via the policy
revoke insert, update, delete, truncate on public.aima_scrape_runs       from anon, authenticated;
revoke insert, update, delete, truncate on public.sandra_call_queue      from anon;       -- authenticated can still INSERT via the policy (TODO when needed)
revoke insert, update, delete, truncate on public.ccavai_drafts          from anon, authenticated;
revoke insert, update, delete, truncate on public.ccavai_runs            from anon, authenticated;
revoke all on public.castillo_webhook_secrets                            from anon, authenticated;
revoke all on public.invoice_number_sequence                             from anon, authenticated;
revoke all on public.n8n_chat_histories                                  from anon, authenticated;

-- service_role retains full access (it's how createServiceClient works on the server)
grant all on public.credit_accounts             to service_role;
grant all on public.credit_transactions         to service_role;
grant all on public.credit_pricing              to service_role;
grant all on public.aima_settings               to service_role;
grant all on public.aima_scrape_runs            to service_role;
grant all on public.sandra_call_queue           to service_role;
grant all on public.ccavai_drafts               to service_role;
grant all on public.ccavai_runs                 to service_role;
grant all on public.castillo_webhook_secrets    to service_role;
grant all on public.invoice_number_sequence     to service_role;
grant all on public.n8n_chat_histories          to service_role;

comment on table public.castillo_webhook_secrets is
  'Shared bearer secrets for /api/billing/debit, /api/voice/tool, /api/content/render-branded, CCAVAI + AIMA triggers. RLS-on with no policies — service_role bypasses, everything else is blocked.';
