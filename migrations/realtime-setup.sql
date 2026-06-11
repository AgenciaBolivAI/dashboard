-- =====================================================================
-- BolivAI — Enable Supabase Realtime on the tables the dashboard streams
-- =====================================================================
-- Supabase Realtime works by subscribing to a Postgres logical replication
-- publication called `supabase_realtime`. New tables are NOT in it by
-- default — you have to add them explicitly.
--
-- Run this once after schema.sql + schema-dashboard.sql are applied.
-- =====================================================================

alter publication supabase_realtime add table chat_history;
alter publication supabase_realtime add table conversations;

-- (Optional) for future features:
-- alter publication supabase_realtime add table reservations;
-- alter publication supabase_realtime add table leads;
