-- =====================================================================
-- BolivAI — Step 32: Employee groups + per-user / per-team credit budgets
-- =====================================================================
-- Lets a tenant cap how many of its shared credits an individual employee
-- or a team (group) may spend on DASHBOARD-INITIATED actions (lead scraping,
-- content, outbound campaigns, invoices, the assistant, KB sync). Customer/
-- agent-driven spend (whatsapp.agent_turn, voice minutes, agent bookings)
-- keeps drawing from the tenant pool, UNbudgeted — it has no employee actor.
--
-- Decisions baked in:
--   * HARD CAP — a debit that would exceed the budget is blocked atomically.
--   * Budgets apply only when an authenticated actor is present.
--   * Each budget is 'monthly' (auto-resets at month start) or 'one_time'.
--   * A member is governed by AT MOST one budget: their personal one if it
--     exists, else their group's. A user belongs to <= 1 group per tenant.
--
-- New tables:   employee_groups, employee_group_members, credit_budgets
-- Ledger:       credit_transactions gains actor_user_id + budget_id
-- New RPCs:     debit_credits_as_user(...)   — attribute + enforce budget
--               reset_due_budgets()          — cosmetic monthly reset (cron)
-- Idempotent.
-- =====================================================================

-- ── Tables ──────────────────────────────────────────────────────────
create table if not exists public.employee_groups (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, name)
);
create index if not exists idx_employee_groups_tenant
  on public.employee_groups (tenant_id);

create table if not exists public.employee_group_members (
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  group_id   uuid not null references public.employee_groups(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (group_id, user_id),
  -- A user belongs to at most ONE group per tenant — keeps "governed by one
  -- budget" unambiguous.
  unique (tenant_id, user_id),
  -- Integrity: a group member must be an actual member of the tenant.
  foreign key (user_id, tenant_id)
    references public.dashboard_users (user_id, tenant_id) on delete cascade
);
create index if not exists idx_egm_tenant_user
  on public.employee_group_members (tenant_id, user_id);

create table if not exists public.credit_budgets (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  scope_type       text not null check (scope_type in ('user','group')),
  scope_id         uuid not null,                    -- auth.users.id OR employee_groups.id
  period           text not null check (period in ('monthly','one_time')),
  allocated_credits bigint not null check (allocated_credits >= 0),
  spent_credits    bigint not null default 0 check (spent_credits >= 0),
  period_start     date   not null default date_trunc('month', now())::date,
  enabled          boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- One budget per target (a user OR a group).
  unique (tenant_id, scope_type, scope_id)
);
create index if not exists idx_credit_budgets_lookup
  on public.credit_budgets (tenant_id, scope_type, scope_id) where enabled;

drop trigger if exists trg_employee_groups_updated on public.employee_groups;
create trigger trg_employee_groups_updated
  before update on public.employee_groups
  for each row execute function set_updated_at();

drop trigger if exists trg_credit_budgets_updated on public.credit_budgets;
create trigger trg_credit_budgets_updated
  before update on public.credit_budgets
  for each row execute function set_updated_at();

-- ── Ledger attribution ──────────────────────────────────────────────
alter table public.credit_transactions
  add column if not exists actor_user_id uuid,
  add column if not exists budget_id     uuid;
create index if not exists idx_credit_tx_actor
  on public.credit_transactions (tenant_id, actor_user_id, created_at desc)
  where actor_user_id is not null;

-- =====================================================================
-- RPC: debit_credits_as_user — attribute spend to an employee, enforce the
-- governing budget (personal else group) as a HARD cap, then debit the tenant
-- pool. When the actor has no governing budget it behaves exactly like
-- debit_credits (tenant pool) but still records actor_user_id for reporting.
-- =====================================================================
create or replace function public.debit_credits_as_user(
  p_tenant_id     uuid,
  p_action_key    text,
  p_actor_user_id uuid,
  p_units         int default 1,
  p_reference_id  text default null,
  p_metadata      jsonb default '{}'::jsonb
) returns table (
  ok               boolean,
  balance_after    bigint,
  credits_debited  bigint,
  budget_remaining bigint,    -- null when no governing budget applies
  reason           text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cpu          bigint;
  v_total        bigint;
  v_balance      bigint;
  v_reserved     bigint;
  v_available    bigint;
  v_budget_id    uuid;
  v_period       text;
  v_allocated    bigint;
  v_spent        bigint;
  v_pstart       date;
  v_month_start  date := date_trunc('month', now())::date;
  v_remaining    bigint;
begin
  if p_units < 1 then
    return query select false, 0::bigint, 0::bigint, null::bigint, 'p_units must be >= 1';
    return;
  end if;

  select credits_per_unit into v_cpu
  from public.credit_pricing where action_key = p_action_key;
  if v_cpu is null then
    return query select false, 0::bigint, 0::bigint, null::bigint,
      format('Unknown action_key: %s', p_action_key);
    return;
  end if;
  v_total := v_cpu * p_units;

  -- Resolve governing budget: personal first, else the actor's group's.
  -- LOCK ORDER: budget row BEFORE the account row (debit_credits only locks
  -- the account, so there is no cross-deadlock).
  select b.id, b.period, b.allocated_credits, b.spent_credits, b.period_start
    into v_budget_id, v_period, v_allocated, v_spent, v_pstart
  from public.credit_budgets b
  where b.tenant_id = p_tenant_id and b.enabled
    and b.scope_type = 'user' and b.scope_id = p_actor_user_id
  for update;

  if v_budget_id is null then
    select b.id, b.period, b.allocated_credits, b.spent_credits, b.period_start
      into v_budget_id, v_period, v_allocated, v_spent, v_pstart
    from public.credit_budgets b
    join public.employee_group_members m
      on m.group_id = b.scope_id and m.tenant_id = b.tenant_id
    where b.tenant_id = p_tenant_id and b.enabled
      and b.scope_type = 'group' and m.user_id = p_actor_user_id
    for update;
  end if;

  -- Lazy monthly reset, inside the lock (no missed-cron risk).
  if v_budget_id is not null and v_period = 'monthly' and v_pstart < v_month_start then
    update public.credit_budgets
       set spent_credits = 0, period_start = v_month_start, updated_at = now()
     where id = v_budget_id;
    v_spent := 0;
  end if;

  -- Budget cap check BEFORE touching the tenant pool.
  if v_budget_id is not null then
    v_remaining := v_allocated - v_spent;
    if v_remaining < v_total then
      return query select false, null::bigint, 0::bigint, v_remaining,
        format('Budget exceeded (need %s, remaining %s)', v_total, v_remaining);
      return;
    end if;
  end if;

  -- Tenant pool: auto-provision + lock (same as debit_credits).
  insert into public.credit_accounts (tenant_id)
    values (p_tenant_id) on conflict (tenant_id) do nothing;

  select balance_credits, reserved_credits into v_balance, v_reserved
  from public.credit_accounts where tenant_id = p_tenant_id for update;
  v_available := v_balance - v_reserved;

  if v_available < v_total then
    update public.credit_accounts
       set out_of_credits_at = coalesce(out_of_credits_at, now()), updated_at = now()
     where tenant_id = p_tenant_id;
    return query select false, v_balance, 0::bigint,
      case when v_budget_id is null then null::bigint else v_allocated - v_spent end,
      format('Insufficient credits (need %s, available %s)', v_total, v_available);
    return;
  end if;

  -- Commit: debit pool, bump budget, write attributed ledger row.
  update public.credit_accounts
     set balance_credits = balance_credits - v_total,
         lifetime_spent_credits = lifetime_spent_credits + v_total,
         updated_at = now()
   where tenant_id = p_tenant_id;

  if v_budget_id is not null then
    update public.credit_budgets
       set spent_credits = spent_credits + v_total, updated_at = now()
     where id = v_budget_id;
    v_remaining := v_allocated - (v_spent + v_total);
  else
    v_remaining := null;
  end if;

  insert into public.credit_transactions
    (tenant_id, type, credits_delta, balance_after, action_key, reference_id,
     metadata, actor_user_id, budget_id)
  values
    (p_tenant_id, 'usage', -v_total, v_balance - v_total, p_action_key, p_reference_id,
     p_metadata, p_actor_user_id, v_budget_id);

  return query select true, v_balance - v_total, v_total, v_remaining, null::text;
end;
$$;

comment on function public.debit_credits_as_user is
  'Debit credits for a dashboard action by a known employee: enforces the governing budget (personal else group) as a hard cap, attributes the spend (actor_user_id + budget_id), then debits the tenant pool. Falls back to a normal tenant-pool debit when the actor has no governing budget.';

-- RPC: reset_due_budgets — flips any monthly budget whose period_start is in a
-- prior month back to zero. Lazy reset in debit_credits_as_user is the real
-- safety net; this just keeps dashboard numbers fresh before anyone spends.
create or replace function public.reset_due_budgets()
returns int
language sql
security definer
set search_path = public
as $$
  with upd as (
    update public.credit_budgets
       set spent_credits = 0,
           period_start  = date_trunc('month', now())::date,
           updated_at    = now()
     where period = 'monthly'
       and period_start < date_trunc('month', now())::date
    returning 1
  )
  select coalesce(count(*), 0)::int from upd;
$$;

-- =====================================================================
-- RLS — members read their tenant's groups/budgets; only admins/owners write
-- (through server actions on the service role). Customers/anon never touch.
-- =====================================================================
alter table public.employee_groups        enable row level security;
alter table public.employee_group_members enable row level security;
alter table public.credit_budgets         enable row level security;

do $$
declare t text;
begin
  foreach t in array array['employee_groups','employee_group_members','credit_budgets'] loop
    execute format('drop policy if exists "%s_member_select" on public.%I', t, t);
    execute format(
      'create policy "%s_member_select" on public.%I for select to authenticated using (public.is_member_of(tenant_id))',
      t, t);

    execute format('drop policy if exists "%s_admin_manage" on public.%I', t, t);
    execute format(
      'create policy "%s_admin_manage" on public.%I for all to authenticated using (public.is_admin_of(tenant_id)) with check (public.is_admin_of(tenant_id))',
      t, t);
  end loop;
end$$;

-- Grants: SELECT for authenticated (RLS-filtered), writes only via service role.
do $$
declare t text;
begin
  foreach t in array array['employee_groups','employee_group_members','credit_budgets'] loop
    execute format('revoke insert, update, delete, truncate on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end$$;

-- The enforcement RPCs are called only by the dashboard service client / n8n.
revoke all on function public.debit_credits_as_user(uuid, text, uuid, int, text, jsonb) from public, anon, authenticated;
grant execute on function public.debit_credits_as_user(uuid, text, uuid, int, text, jsonb) to service_role;
revoke all on function public.reset_due_budgets() from public, anon, authenticated;
grant execute on function public.reset_due_budgets() to service_role;
