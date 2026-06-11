# Database migrations

Hand-authored SQL migrations for the BolivAI Supabase Postgres database.

## How they're applied

These are **not** run automatically. They were applied manually (via the n8n
one-shot Postgres pattern or the Supabase SQL editor) at the time each feature
shipped. This folder is the version-controlled record of the schema's evolution
so the migration history lives alongside the app that depends on it.

## Naming

- `schema.sql` — base schema (earliest snapshot).
- `schema-stepN-<slug>.sql` — incremental, numbered migrations. Apply in order.
- Other `schema-*.sql` / setup files (`storage-setup`, `realtime-setup`,
  `fix-rls-recursion`, `bolivai-tenant-*`) — one-off setup/seed scripts.

All migrations are written to be **idempotent** (`create ... if not exists`,
`add column if not exists`, etc.) so re-running them is safe.

## Latest

- `schema-step28-fix-sandra-tick-ingest.sql` — adds the partial unique index
  `brain.episodes_elevenlabs_conv_uniq` that the Sandra/Rebecca tick's episode
  upsert requires. Without it every upsert threw and was swallowed by
  `continueOnFail`, so leads never updated after calls.
