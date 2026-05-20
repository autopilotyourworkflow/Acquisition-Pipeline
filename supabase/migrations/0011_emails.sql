-- ===========================================================================
-- 0011 — cold-outreach emails (Phase 3e)
--
-- Outbound-sourced candidates ('sourced' stage) are the primary surface for
-- cold-email sends. HR clicks "Draft cold email" → Opus drafts → HR edits →
-- Gmail send. Every send is logged here AND in `activity_log` via withAudit.
--
-- Status lifecycle:
--   drafted   — row exists, no Gmail message yet (transient; we insert the
--               row in the same withAudit closure as the Gmail send call, so
--               on success it flips to 'sent' before the user sees anything)
--   sent      — Gmail send succeeded; gmail_message_id + sent_at populated
--   failed    — Gmail send raised an error; `error` populated
--   discarded — user closed the dialog without sending (optional; safe to skip)
--
-- RLS: org-scoped via the candidate row's org_id. Reads/writes restricted
-- to org members. No public surface — emails are an internal artifact.
-- ===========================================================================

CREATE TABLE public.emails (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  candidate_id        uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  jd_id               uuid REFERENCES public.job_descriptions(id) ON DELETE SET NULL,
  user_id             uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  status              text NOT NULL CHECK (status IN ('drafted','sent','failed','discarded')),
  subject             text NOT NULL,
  body_markdown       text NOT NULL,
  rationale           text,
  gmail_message_id    text,
  gmail_thread_id     text,
  sent_at             timestamptz,
  error               text,
  row_hash            text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX emails_candidate_created_idx
  ON public.emails (candidate_id, created_at DESC);

CREATE INDEX emails_user_created_idx
  ON public.emails (user_id, created_at DESC);

CREATE TRIGGER emails_updated_at
  BEFORE UPDATE ON public.emails
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;

-- Org-scoped read: anyone in the org can see what cold emails went out
-- against any candidate. Same model the rest of the schema uses.
CREATE POLICY emails_org_read ON public.emails FOR SELECT
  USING (public.is_same_org(org_id));

-- Writes restricted to the sender — keeps one user from clobbering another's
-- draft. Service-role bypasses anyway for the audit-wrapped server action.
CREATE POLICY emails_self_write ON public.emails FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.is_same_org(org_id));

CREATE POLICY emails_self_update ON public.emails FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY emails_self_delete ON public.emails FOR DELETE
  USING (user_id = auth.uid());

-- Per-user signature + from-name for cold emails. Both nullable — the user
-- fills them at /settings/integrations. The send path treats null as
-- "don't append anything / fall back to the user's Gmail display name."
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS email_signature text,
  ADD COLUMN IF NOT EXISTS email_from_name text;
