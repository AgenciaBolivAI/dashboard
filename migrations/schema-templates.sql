-- =====================================================================
-- BolivAI — Workflow templates + gateway abstraction
-- =====================================================================
-- Adds:
--   - tenants.workflow_template  (which agent type this tenant runs)
--   - tenants.gateway            (which messaging gateway it uses)
--   - tenants.gateway_config     (gateway-specific config: instance,
--                                 phone_number_id, access_token, etc.)
--
-- Backfills gateway_config from the existing evolution_instance column
-- so existing tenants keep working.
--
-- evolution_instance stays around for now (the n8n workflow still reads
-- it) — it'll be migrated to gateway_config.instance in Unit C.
--
-- Apply once. Idempotent.
-- =====================================================================

alter table tenants
  add column if not exists workflow_template text not null default 'physio',
  add column if not exists gateway text not null default 'evolution'
    check (gateway in ('evolution', 'meta_whatsapp', 'twilio')),
  add column if not exists gateway_config jsonb not null default '{}';

-- Backfill gateway_config.instance for tenants that already have an
-- evolution_instance set
update tenants
set gateway_config = jsonb_set(
  coalesce(gateway_config, '{}'::jsonb),
  '{instance}',
  to_jsonb(evolution_instance::text)
)
where evolution_instance is not null
  and not (gateway_config ? 'instance');

create index if not exists idx_tenants_workflow_template on tenants (workflow_template);
create index if not exists idx_tenants_gateway on tenants (gateway);
