-- Phase 3d.5 — JobsDB / LinkedIn bookmarklet capture
--
-- HR drags a bookmarklet onto their browser. While logged into JobsDB
-- (or LinkedIn) on a candidate page, they click it; the snippet POSTs
-- the rendered DOM text to /api/scrape/bookmarklet with this token in
-- the Authorization header. The token resolves to a user_id, the
-- endpoint normalizes via Haiku and inserts as a candidate.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS bookmarklet_token text;

CREATE UNIQUE INDEX IF NOT EXISTS user_settings_bookmarklet_token_uidx
  ON public.user_settings (bookmarklet_token)
  WHERE bookmarklet_token IS NOT NULL;
