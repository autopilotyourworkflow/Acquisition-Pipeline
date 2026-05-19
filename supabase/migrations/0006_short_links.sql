-- ===========================================================================
-- 0006 — short_links
--
-- Internal URL shortener so we don't paste 400-character Supabase signed URLs
-- into calendar invites. Calendar event description includes
-- https://acq.autopilotyourworkflow.com/l/<slug>, which the app's /l/[slug]
-- route looks up and 302-redirects to the real signed URL.
--
-- Scope: created by the interviews API (cv links). Generalizable to anything
-- else we want to expose by a short URL later — generic url column, no
-- foreign keys to specific tables.
-- ===========================================================================

CREATE TABLE public.short_links (
  slug         text PRIMARY KEY,
  url          text NOT NULL,
  expires_at   timestamptz,
  org_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  created_by   uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX short_links_expires_at_idx ON public.short_links (expires_at);

-- RLS: org-scoped writes (same pattern as the rest of the schema). Reads are
-- intentionally open so the public /l/[slug] route can resolve a slug for
-- ANYONE who has the URL (calendar invitees won't have an app session).
-- The slug itself is the access control — 12 random base62 chars =
-- ~71 bits of entropy, infeasible to enumerate.
ALTER TABLE public.short_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY short_links_public_read ON public.short_links
  FOR SELECT
  USING (true);

CREATE POLICY short_links_org_write ON public.short_links
  FOR INSERT
  WITH CHECK (public.is_same_org(org_id));

CREATE POLICY short_links_org_update ON public.short_links
  FOR UPDATE
  USING (public.is_same_org(org_id))
  WITH CHECK (public.is_same_org(org_id));

CREATE POLICY short_links_org_delete ON public.short_links
  FOR DELETE
  USING (public.is_same_org(org_id));
