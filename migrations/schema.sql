-- =====================================================================
-- BolivAI agent platform — Supabase schema
-- =====================================================================
-- Multi-tenant by tenant_id. Every row in every domain table belongs
-- to exactly one tenant. n8n connects via the service_role key and
-- bypasses RLS; the dashboard will use the anon/authenticated role
-- with proper RLS once auth is wired up.
--
-- HOW TO APPLY:
--   1. Create a Supabase project at supabase.com
--   2. Open SQL Editor → paste this whole file → Run
--   3. Settings → Database → copy the connection string for n8n
--   4. (Optional) uncomment the SEED block at the bottom to bootstrap
--      the Cervantes/Eva demo tenant
-- =====================================================================


-- ─── Extensions ──────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists vector;


-- ─── Tenants (BolivAI's customers — each runs one bot) ───────────────
create table if not exists tenants (
  id                  uuid primary key default uuid_generate_v4(),
  slug                text unique not null,                 -- e.g. 'cervantes'
  name                text not null,                        -- e.g. 'Clínica Cervantes'
  industry            text,                                 -- 'physio', 'dental', 'real-estate'...
  plan                text not null default 'starter',      -- starter | pro | business | enterprise | whitelabel
  status              text not null default 'active',       -- active | paused | cancelled
  prompt_template     text,                                 -- the full system prompt (use {{variables}})
  prompt_variables    jsonb not null default '{}',          -- per-tenant fill-ins, e.g. {"company":"Cervantes"}
  evolution_instance  text,                                 -- which Evolution API instance to use
  whatsapp_number     text,
  timezone            text not null default 'America/La_Paz',
  language            text not null default 'es',           -- 'es', 'es-ES', 'es-BO'...
  metadata            jsonb not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);


-- ─── Users (WhatsApp end-users that talk to a tenant's bot) ──────────
create table if not exists users (
  id                  uuid primary key default uuid_generate_v4(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  whatsapp_number     text not null,                        -- the phone number (jid without @s.whatsapp.net)
  name                text,
  email               text,
  facts               text,                                 -- last-known summary (Zep is source of truth)
  zep_session_id      text,                                 -- key in Zep for long-term memory
  metadata            jsonb not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, whatsapp_number)
);


-- ─── Conversations (one open thread per user) ────────────────────────
create table if not exists conversations (
  id                  uuid primary key default uuid_generate_v4(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  user_id             uuid not null references users(id) on delete cascade,
  status              text not null default 'active',       -- active | paused | closed
  hitl_taken_over     boolean not null default false,       -- true while a human operator has it
  hitl_operator_id    uuid,                                  -- reference to dashboard.users when we add that
  hitl_taken_over_at  timestamptz,
  last_message_at     timestamptz not null default now(),
  created_at          timestamptz not null default now()
);


-- ─── Chat history (every message in/out) ─────────────────────────────
create table if not exists chat_history (
  id                  bigserial primary key,
  tenant_id           uuid not null references tenants(id) on delete cascade,
  conversation_id     uuid not null references conversations(id) on delete cascade,
  user_id             uuid not null references users(id) on delete cascade,
  role                text not null check (role in ('user','assistant','system','tool','operator')),
  content             text not null,
  is_pending          boolean not null default false,       -- true while inside the 7s debounce window
  evolution_message_id text,                                -- Evolution API's message id, for dedup
  metadata            jsonb not null default '{}',
  created_at          timestamptz not null default now()
);


-- ─── Staff (the people who get booked) ───────────────────────────────
create table if not exists staff (
  id                  uuid primary key default uuid_generate_v4(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  name                text not null,
  email               text,
  role                text,                                 -- 'fisioterapeuta', 'doctor', etc.
  active              boolean not null default true,
  metadata            jsonb not null default '{}',
  created_at          timestamptz not null default now()
);


-- ─── Calendar slots (available time blocks per staff) ────────────────
create table if not exists calendar_slots (
  id                  uuid primary key default uuid_generate_v4(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  staff_id            uuid not null references staff(id) on delete cascade,
  start_at            timestamptz not null,
  end_at              timestamptz not null,
  is_available        boolean not null default true,
  created_at          timestamptz not null default now(),
  check (end_at > start_at)
);


-- ─── Staff daily load (denormalized for fast list queries) ───────────
create table if not exists staff_daily_load (
  staff_id            uuid not null references staff(id) on delete cascade,
  tenant_id           uuid not null references tenants(id) on delete cascade,
  date                date not null,
  booked_minutes      int not null default 0,
  available_minutes   int not null default 0,
  primary key (staff_id, date)
);


-- ─── Reservations (confirmed bookings) ───────────────────────────────
create table if not exists reservations (
  id                  uuid primary key default uuid_generate_v4(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  user_id             uuid references users(id) on delete set null,
  staff_id            uuid references staff(id) on delete set null,
  slot_id             uuid references calendar_slots(id) on delete set null,
  start_at            timestamptz not null,
  end_at              timestamptz not null,
  duration_minutes    int not null,
  status              text not null default 'confirmed',    -- confirmed | cancelled | completed | no_show
  customer_name       text,
  customer_email      text,
  customer_phone      text,
  notes               text,
  created_at          timestamptz not null default now(),
  check (end_at > start_at)
);


-- ─── Leads (for the dashboard's leads view) ──────────────────────────
create table if not exists leads (
  id                  uuid primary key default uuid_generate_v4(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  user_id             uuid references users(id) on delete set null,
  conversation_id     uuid references conversations(id) on delete set null,
  name                text,
  whatsapp_number     text,
  email               text,
  intent              text,                                 -- 'booking' | 'pricing' | 'support' | 'other'
  status              text not null default 'new',          -- new | contacted | converted | lost
  notes               text,
  created_at          timestamptz not null default now()
);


-- ─── Documents (FAQ-style chunks, for the `faq` tool) ────────────────
create table if not exists documents (
  id                  bigserial primary key,
  tenant_id           uuid not null references tenants(id) on delete cascade,
  source              text,                                 -- filename, URL, etc.
  question            text,                                 -- the FAQ question this chunk answers
  answer              text,                                 -- the literal answer
  response_template   text,                                 -- example phrasing the agent should use
  content             text not null,                        -- the full chunk text (what gets embedded)
  embedding           vector(1536),                         -- text-embedding-3-small
  metadata            jsonb not null default '{}',
  created_at          timestamptz not null default now()
);


-- ─── Pain (symptom/diagnostic chunks, for the `problem` tool) ────────
create table if not exists pain (
  id                  bigserial primary key,
  tenant_id           uuid not null references tenants(id) on delete cascade,
  source              text,
  symptom             text,
  diagnosis           text,
  recommendation      text,
  content             text not null,
  embedding           vector(1536),
  metadata            jsonb not null default '{}',
  created_at          timestamptz not null default now()
);


-- ─── Record manager (dedup for ingestion runs) ───────────────────────
create table if not exists record_manager (
  id                  bigserial primary key,
  tenant_id           uuid not null references tenants(id) on delete cascade,
  source              text not null,
  hash                text not null,
  ingested_at         timestamptz not null default now(),
  unique (tenant_id, hash)
);


-- =====================================================================
-- Indexes
-- =====================================================================
create index if not exists idx_users_tenant_phone
  on users (tenant_id, whatsapp_number);

create index if not exists idx_conversations_user_recent
  on conversations (user_id, last_message_at desc);

create index if not exists idx_chat_history_conversation
  on chat_history (conversation_id, created_at);

create index if not exists idx_chat_history_pending
  on chat_history (conversation_id)
  where is_pending = true;

create index if not exists idx_calendar_slots_lookup
  on calendar_slots (tenant_id, staff_id, start_at)
  where is_available = true;

create index if not exists idx_reservations_lookup
  on reservations (tenant_id, start_at);

create index if not exists idx_leads_tenant_status
  on leads (tenant_id, status, created_at desc);

-- HNSW vector indexes for similarity search
create index if not exists idx_documents_embedding
  on documents using hnsw (embedding vector_cosine_ops);

create index if not exists idx_pain_embedding
  on pain using hnsw (embedding vector_cosine_ops);


-- =====================================================================
-- Helper functions (callable from n8n via Postgres / Supabase RPC node)
-- =====================================================================

-- ─── match_documents: vector search for the `faq` tool ───────────────
create or replace function match_documents (
  query_embedding   vector(1536),
  match_count       int default 3,
  p_tenant_id       uuid default null
) returns table (
  id                bigint,
  content           text,
  question          text,
  answer            text,
  response_template text,
  similarity        float
) language sql stable as $$
  select
    d.id,
    d.content,
    d.question,
    d.answer,
    d.response_template,
    1 - (d.embedding <=> query_embedding) as similarity
  from documents d
  where p_tenant_id is null or d.tenant_id = p_tenant_id
  order by d.embedding <=> query_embedding
  limit match_count;
$$;


-- ─── match_pain: vector search for the `problem` tool ────────────────
create or replace function match_pain (
  query_embedding   vector(1536),
  match_count       int default 3,
  p_tenant_id       uuid default null
) returns table (
  id                bigint,
  content           text,
  symptom           text,
  diagnosis         text,
  recommendation    text,
  similarity        float
) language sql stable as $$
  select
    p.id,
    p.content,
    p.symptom,
    p.diagnosis,
    p.recommendation,
    1 - (p.embedding <=> query_embedding) as similarity
  from pain p
  where p_tenant_id is null or p.tenant_id = p_tenant_id
  order by p.embedding <=> query_embedding
  limit match_count;
$$;


-- ─── search_slots_day: list free slots for a given date ──────────────
create or replace function search_slots_day (
  p_tenant_id       uuid,
  p_date            date,
  p_duration_min    int default 30
) returns table (
  staff_id          uuid,
  staff_name        text,
  start_at          timestamptz,
  end_at            timestamptz
) language sql stable as $$
  select
    s.staff_id,
    st.name,
    s.start_at,
    s.end_at
  from calendar_slots s
  join staff st on st.id = s.staff_id
  where s.tenant_id = p_tenant_id
    and (s.start_at at time zone 'UTC')::date = p_date
    and s.is_available = true
    and (s.end_at - s.start_at) >= make_interval(mins => p_duration_min)
  order by s.start_at;
$$;


-- ─── book_slot: atomically reserve a slot ────────────────────────────
create or replace function book_slot (
  p_tenant_id       uuid,
  p_user_id         uuid,
  p_slot_id         uuid,
  p_duration_min    int,
  p_customer_name   text,
  p_customer_email  text,
  p_customer_phone  text default null,
  p_notes           text default null
) returns reservations language plpgsql as $$
declare
  v_slot calendar_slots%rowtype;
  v_reservation reservations%rowtype;
begin
  -- Lock the slot row to prevent double-booking
  select * into v_slot
  from calendar_slots
  where id = p_slot_id and tenant_id = p_tenant_id and is_available = true
  for update;

  if not found then
    raise exception 'Slot % not available', p_slot_id;
  end if;

  insert into reservations (
    tenant_id, user_id, staff_id, slot_id,
    start_at, end_at, duration_minutes,
    customer_name, customer_email, customer_phone, notes
  ) values (
    p_tenant_id, p_user_id, v_slot.staff_id, v_slot.id,
    v_slot.start_at, v_slot.start_at + make_interval(mins => p_duration_min), p_duration_min,
    p_customer_name, p_customer_email, p_customer_phone, p_notes
  ) returning * into v_reservation;

  update calendar_slots set is_available = false where id = p_slot_id;

  return v_reservation;
end;
$$;


-- ─── updated_at trigger helper ───────────────────────────────────────
create or replace function set_updated_at () returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tenants_updated on tenants;
create trigger trg_tenants_updated
  before update on tenants
  for each row execute function set_updated_at();

drop trigger if exists trg_users_updated on users;
create trigger trg_users_updated
  before update on users
  for each row execute function set_updated_at();


-- =====================================================================
-- Row Level Security (basic — refine when dashboard auth is wired)
-- =====================================================================
-- For now: enable RLS on every domain table but add no policies.
-- Service role (n8n) bypasses RLS automatically, so the workflow keeps
-- working. Anon/authenticated requests are denied until policies exist.
-- =====================================================================

alter table tenants          enable row level security;
alter table users            enable row level security;
alter table conversations    enable row level security;
alter table chat_history     enable row level security;
alter table staff            enable row level security;
alter table calendar_slots   enable row level security;
alter table staff_daily_load enable row level security;
alter table reservations     enable row level security;
alter table leads            enable row level security;
alter table documents        enable row level security;
alter table pain             enable row level security;
alter table record_manager   enable row level security;


-- =====================================================================
-- SEED — Cervantes/Eva demo tenant (uncomment to load)
-- =====================================================================
-- insert into tenants (slug, name, industry, plan, prompt_template, prompt_variables, timezone, language)
-- values (
--   'cervantes',
--   'Clínica Cervantes',
--   'physio',
--   'pro',
--   $prompt$
-- # Rol
-- You are a conversational agent and your misión is to have a conversation with the user and
-- help them book a session and answer their questions about it.
-- Your name is {{agent_name}}, you are a recepcionist working for the company "{{company_name}}"
-- which specializes in {{industry}}. You are originally from {{agent_origin}} and have been
-- working for the company for the last 5 years.
-- ## Personality
-- - Authentic, witty, casual — like a real WhatsApp chat.
-- - Humble, comfortable saying you don't know something.
-- ## Rules
-- - Never mention that you are an AI.
-- - Always start by asking the user's name if not already known.
-- - Responses ≤ 100 words.
-- - Always answer in {{spanish_variant}}.
-- - Use the tools when needed: search_slots_day, book_slot, problem, faq.
-- $prompt$,
--   '{
--     "agent_name": "Eva",
--     "company_name": "Cervantes",
--     "industry": "fisioterapia",
--     "agent_origin": "Madrid",
--     "spanish_variant": "español de España (de Madrid, sin expresiones latinoamericanas)"
--   }'::jsonb,
--   'Europe/Madrid',
--   'es-ES'
-- );

-- insert into staff (tenant_id, name, role)
-- select id, 'Carlos Ruiz', 'fisioterapeuta' from tenants where slug = 'cervantes';

-- -- Generate calendar slots for the next 14 days (weekdays 9–18, 30-min blocks)
-- insert into calendar_slots (tenant_id, staff_id, start_at, end_at)
-- select
--   t.id,
--   s.id,
--   d::timestamptz + (h || ' hours')::interval + (m || ' minutes')::interval,
--   d::timestamptz + (h || ' hours')::interval + ((m + 30) || ' minutes')::interval
-- from tenants t
-- join staff s on s.tenant_id = t.id and s.name = 'Carlos Ruiz'
-- cross join generate_series(current_date, current_date + interval '14 days', interval '1 day') d
-- cross join generate_series(9, 17) h
-- cross join (values (0), (30)) as m_table(m)
-- where t.slug = 'cervantes'
--   and extract(dow from d) between 1 and 5;
