-- =====================================================================
-- BolivAI — ccavai_drafts member UPDATE policy + grant
-- =====================================================================
-- The content page lets operators approve / reject / archive / mark-posted
-- a draft (all are UPDATEs of ccavai_drafts.status via
-- updateCcavaiDraftStatusAction). step20 added only a member SELECT policy,
-- and the step17 RLS lockdown left UPDATE ungranted to `authenticated` — so
-- the dashboard (RLS-bound client) hit "permission denied for table
-- ccavai_drafts" on every reject/archive.
--
-- This grants UPDATE + adds a member UPDATE policy mirroring the existing
-- ccavai_drafts_member_select (tenant membership via dashboard_users, or
-- bolivai_admin). No DELETE — the app never hard-deletes drafts, only
-- changes status.
--
-- Idempotent.
-- =====================================================================

grant update on public.ccavai_drafts to authenticated;

drop policy if exists ccavai_drafts_member_update on public.ccavai_drafts;
create policy ccavai_drafts_member_update on public.ccavai_drafts
  for update to authenticated
  using (
    (exists (
      select 1 from public.dashboard_users du
      where du.user_id = auth.uid() and du.tenant_id = ccavai_drafts.tenant_id
    )) or is_bolivai_admin()
  )
  with check (
    (exists (
      select 1 from public.dashboard_users du
      where du.user_id = auth.uid() and du.tenant_id = ccavai_drafts.tenant_id
    )) or is_bolivai_admin()
  );
