-- =====================================================================
-- BolivAI — Storage buckets
-- =====================================================================
-- Run after schemas are applied. Creates the buckets the dashboard uses.
-- =====================================================================

-- Branding: tenant logos. Public read so client browsers can render them
-- without auth. Writes go through the dashboard server (service role).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 5242880,
        array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Knowledge: source documents for ingestion (FAQs, manuals, etc.)
-- Private — only the dashboard server reads these.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('knowledge', 'knowledge', false, 26214400,
        array['application/pdf','text/plain','text/markdown',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
