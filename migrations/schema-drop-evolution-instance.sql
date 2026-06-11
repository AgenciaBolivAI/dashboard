-- =====================================================================
-- BolivAI — Drop the legacy tenants.evolution_instance column
-- =====================================================================
-- Now that all workflows + dashboard code read from gateway_config->>'instance'
-- (set up in schema-templates.sql), the legacy column is dead weight.
--
-- Apply ONLY after:
--   1. schema-templates.sql is applied (which backfilled gateway_config.instance)
--   2. The new versions of eva-template.json + eva-realestate.json are
--      imported into n8n and active
--   3. The dashboard is redeployed with the evolution_instance references removed
--
-- This script is defensive — it bails out if any tenant on the evolution
-- gateway is missing gateway_config.instance, so you can't accidentally
-- nuke the only place an instance was stored.
-- =====================================================================

do $$
declare
  v_orphans int;
begin
  select count(*) into v_orphans
  from tenants
  where gateway = 'evolution'
    and (gateway_config->>'instance') is null
    and evolution_instance is not null;

  if v_orphans > 0 then
    raise exception
      'Refusing to drop evolution_instance: % tenant(s) have evolution_instance set but gateway_config.instance is missing. Re-run the backfill from schema-templates.sql first.',
      v_orphans;
  end if;
end$$;

alter table tenants drop column if exists evolution_instance;
