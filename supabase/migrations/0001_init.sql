-- ============================================================================
-- 0001_init.sql — Acquisition Pipeline initial schema
-- ============================================================================
-- Org-scoped recruiting workflow with full audit log + per-user undo/redo.
-- Single-org MVP: org_id is hardcoded to the constant below; can become a
-- FK to a real `orgs` table later without migrating callers.
--
-- Apply by pasting into Supabase Dashboard -> SQL Editor -> Run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extensions
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;       -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;        -- fuzzy candidate search

-- ----------------------------------------------------------------------------
-- 2. Enums
-- ----------------------------------------------------------------------------
CREATE TYPE candidate_stage AS ENUM
  ('applied', 'screening', 'prescreen_call', 'first_interview', 'offer', 'hired', 'rejected');

CREATE TYPE candidate_source AS ENUM
  ('linkedin', 'jobsdb', 'referral', 'paste', 'pdf', 'screenshot', 'thirdparty_api', 'extension', 'manual');

CREATE TYPE interview_status AS ENUM
  ('scheduled', 'rescheduled', 'cancelled', 'completed', 'no_show');

CREATE TYPE audit_action AS ENUM ('insert', 'update', 'delete');

CREATE TYPE invite_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');

CREATE TYPE app_role AS ENUM ('owner', 'member');

CREATE TYPE attachment_kind AS ENUM ('cv_pdf', 'screenshot', 'other');

CREATE TYPE email_draft_status AS ENUM ('drafted', 'sent', 'discarded');

-- ----------------------------------------------------------------------------
-- 3. Helper: updated_at trigger
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Tables
-- ----------------------------------------------------------------------------

-- 4.1 users (app-level, mirrors auth.users)
CREATE TABLE public.users (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  email       text NOT NULL UNIQUE,
  full_name   text,
  avatar_url  text,
  role        app_role NOT NULL DEFAULT 'member',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- First user becomes 'owner'; subsequent users default to 'member'.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.users;
  INSERT INTO public.users (id, email, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    CASE WHEN v_count = 0 THEN 'owner'::app_role ELSE 'member'::app_role END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4.2 invitations
CREATE TABLE public.invitations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  email       text NOT NULL,
  invited_by  uuid NOT NULL REFERENCES public.users(id),
  token       text NOT NULL UNIQUE,
  status      invite_status NOT NULL DEFAULT 'pending',
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX invitations_email_idx ON public.invitations (email);
CREATE INDEX invitations_token_idx ON public.invitations (token);

-- 4.3 job_descriptions
CREATE TABLE public.job_descriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  title         text NOT NULL,
  department    text,
  location      text,
  body_markdown text NOT NULL,
  must_have     jsonb NOT NULL DEFAULT '[]'::jsonb,
  nice_to_have  jsonb NOT NULL DEFAULT '[]'::jsonb,
  weights       jsonb NOT NULL DEFAULT '{"skills":0.4,"experience":0.4,"culture":0.2}'::jsonb,
  threshold     numeric(3,1) NOT NULL DEFAULT 7.0,
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER jd_updated_at
  BEFORE UPDATE ON public.job_descriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4.4 candidates
CREATE TABLE public.candidates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  full_name     text NOT NULL,
  email         text,
  phone         text,
  current_title text,
  location      text,
  linkedin_url  text,
  source        candidate_source NOT NULL,
  source_url    text,
  stage         candidate_stage NOT NULL DEFAULT 'applied',
  jd_id         uuid REFERENCES public.job_descriptions(id) ON DELETE SET NULL,
  applied_at    date NOT NULL DEFAULT current_date,
  raw_profile   jsonb,  -- skills[], experience[], education[]
  notes         text,
  row_hash      text,   -- sha256(canonicalJSON(row)) — recomputed in app on each mutation
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX candidates_stage_idx     ON public.candidates (stage);
CREATE INDEX candidates_jd_idx        ON public.candidates (jd_id);
CREATE INDEX candidates_source_idx    ON public.candidates (source);
CREATE INDEX candidates_name_trgm_idx ON public.candidates USING gin (full_name gin_trgm_ops);
CREATE TRIGGER candidates_updated_at
  BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4.5 attachments (Supabase Storage refs)
CREATE TABLE public.attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  candidate_id uuid REFERENCES public.candidates(id) ON DELETE CASCADE,
  kind         attachment_kind NOT NULL,
  storage_path text NOT NULL,            -- e.g. 'org/<uuid>/candidate/<uuid>/cv.pdf'
  mime_type    text,
  bytes        integer,
  parsed_text  text,                     -- cached pdf-parse / vision extraction
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attachments_candidate_idx ON public.attachments (candidate_id);

-- 4.6 scores (one row per screening run)
CREATE TABLE public.scores (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  candidate_id     uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  jd_id            uuid NOT NULL REFERENCES public.job_descriptions(id),
  skills_score     numeric(3,1) NOT NULL CHECK (skills_score BETWEEN 0 AND 10),
  experience_score numeric(3,1) NOT NULL CHECK (experience_score BETWEEN 0 AND 10),
  culture_score    numeric(3,1) NOT NULL CHECK (culture_score BETWEEN 0 AND 10),
  weighted_total   numeric(4,2) GENERATED ALWAYS AS
    (skills_score * 0.4 + experience_score * 0.4 + culture_score * 0.2) STORED,
  reasoning        jsonb NOT NULL,        -- { skills:"...", experience:"...", culture:"..." }
  strengths        jsonb DEFAULT '[]'::jsonb,
  gaps             jsonb DEFAULT '[]'::jsonb,
  prep_questions   jsonb DEFAULT '[]'::jsonb,
  hiring_report    text,
  model            text NOT NULL,         -- 'claude-opus-4-7'
  prompt_version   text NOT NULL,
  input_tokens     integer,
  output_tokens    integer,
  cost_usd         numeric(8,4),
  created_by       uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scores_candidate_idx ON public.scores (candidate_id);
CREATE INDEX scores_jd_idx        ON public.scores (jd_id);

-- 4.7 interviews
CREATE TABLE public.interviews (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  candidate_id        uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  jd_id               uuid REFERENCES public.job_descriptions(id) ON DELETE SET NULL,
  stage               candidate_stage NOT NULL,
  status              interview_status NOT NULL DEFAULT 'scheduled',
  starts_at           timestamptz NOT NULL,
  ends_at             timestamptz NOT NULL,
  google_event_id     text,
  google_calendar_id  text,
  meet_url            text,
  description         text,
  organizer_id        uuid NOT NULL REFERENCES public.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX interviews_candidate_idx ON public.interviews (candidate_id);
CREATE INDEX interviews_starts_at_idx ON public.interviews (starts_at);
CREATE TRIGGER interviews_updated_at
  BEFORE UPDATE ON public.interviews
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4.8 interview_invitees
CREATE TABLE public.interview_invitees (
  interview_id    uuid REFERENCES public.interviews(id) ON DELETE CASCADE,
  user_id         uuid REFERENCES public.users(id) ON DELETE CASCADE,
  external_email  text,
  response_status text,            -- accepted | declined | tentative | needsAction
  identity_key    text GENERATED ALWAYS AS (COALESCE(user_id::text, external_email)) STORED,
  PRIMARY KEY (interview_id, identity_key),
  CHECK (user_id IS NOT NULL OR external_email IS NOT NULL)
);

-- 4.9 activity_log (audit + undo backbone)
CREATE TABLE public.activity_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  actor_id     uuid NOT NULL REFERENCES public.users(id),
  action       audit_action NOT NULL,
  target_table text NOT NULL,
  target_id    uuid NOT NULL,
  before       jsonb,
  after        jsonb,
  after_hash   text,
  undone_at    timestamptz,
  undone_by    uuid REFERENCES public.users(id),
  redo_of      uuid REFERENCES public.activity_log(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_log_actor_idx  ON public.activity_log (actor_id, created_at DESC);
CREATE INDEX activity_log_target_idx ON public.activity_log (target_table, target_id);

-- 4.10 email_drafts
CREATE TABLE public.email_drafts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  candidate_id    uuid REFERENCES public.candidates(id) ON DELETE CASCADE,
  score_id        uuid REFERENCES public.scores(id) ON DELETE SET NULL,
  gmail_draft_id  text,
  subject         text,
  body_html       text,
  status          email_draft_status NOT NULL DEFAULT 'drafted',
  created_by      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_drafts_candidate_idx ON public.email_drafts (candidate_id);

-- 4.11 oauth_tokens (Google scopes per user)
-- We encrypt the refresh_token in Node before insert using AES-GCM with
-- OAUTH_ENCRYPTION_SECRET; Postgres just stores the opaque blob.
CREATE TABLE public.oauth_tokens (
  user_id                 uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  provider                text NOT NULL DEFAULT 'google',
  access_token            text NOT NULL,
  refresh_token_encrypted bytea NOT NULL,
  scopes                  text[] NOT NULL DEFAULT ARRAY[]::text[],
  expires_at              timestamptz NOT NULL,
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER oauth_tokens_updated_at
  BEFORE UPDATE ON public.oauth_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4.12 extension_tokens (long-lived JWTs for the Chrome extension)
CREATE TABLE public.extension_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash    text NOT NULL,
  label         text,
  last_used_at  timestamptz,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX extension_tokens_user_idx ON public.extension_tokens (user_id);

-- ----------------------------------------------------------------------------
-- 5. Row Level Security
-- ----------------------------------------------------------------------------
-- All app tables: any authenticated user in our public.users table can
-- read + write within the single org. oauth_tokens / extension_tokens add
-- a "must be your own" predicate. invitations are also same-org but token
-- lookup happens via service-role at /accept-invite.

-- Helper: same-org membership check
CREATE OR REPLACE FUNCTION public.is_same_org(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.org_id = p_org_id
  );
$$;

-- users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_select ON public.users FOR SELECT
  USING (public.is_same_org(org_id));
CREATE POLICY users_update_self ON public.users FOR UPDATE
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- invitations (writes happen via service role from API routes)
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY invitations_select ON public.invitations FOR SELECT
  USING (public.is_same_org(org_id));

-- job_descriptions
ALTER TABLE public.job_descriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY jds_all ON public.job_descriptions FOR ALL
  USING (public.is_same_org(org_id))
  WITH CHECK (public.is_same_org(org_id));

-- candidates
ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY candidates_all ON public.candidates FOR ALL
  USING (public.is_same_org(org_id))
  WITH CHECK (public.is_same_org(org_id));

-- attachments
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY attachments_all ON public.attachments FOR ALL
  USING (public.is_same_org(org_id))
  WITH CHECK (public.is_same_org(org_id));

-- scores
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY scores_all ON public.scores FOR ALL
  USING (public.is_same_org(org_id))
  WITH CHECK (public.is_same_org(org_id));

-- interviews
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY interviews_all ON public.interviews FOR ALL
  USING (public.is_same_org(org_id))
  WITH CHECK (public.is_same_org(org_id));

-- interview_invitees (no org_id; permissive — interviews already gates)
ALTER TABLE public.interview_invitees ENABLE ROW LEVEL SECURITY;
CREATE POLICY interview_invitees_all ON public.interview_invitees FOR ALL
  USING (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = interview_id AND public.is_same_org(i.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = interview_id AND public.is_same_org(i.org_id)));

-- activity_log (insert via service role; select org-wide)
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY activity_log_select ON public.activity_log FOR SELECT
  USING (public.is_same_org(org_id));

-- email_drafts
ALTER TABLE public.email_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_drafts_all ON public.email_drafts FOR ALL
  USING (public.is_same_org(org_id))
  WITH CHECK (public.is_same_org(org_id));

-- oauth_tokens (per-user)
ALTER TABLE public.oauth_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY oauth_tokens_self ON public.oauth_tokens FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- extension_tokens (per-user)
ALTER TABLE public.extension_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY extension_tokens_self ON public.extension_tokens FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 6. Storage buckets + RLS
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('cvs', 'cvs', false), ('screenshots', 'screenshots', false)
ON CONFLICT (id) DO NOTHING;

-- Any authenticated team member can read/write within these buckets.
-- Single-org so "in our users table" == "same org."
CREATE POLICY storage_cvs_authenticated ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id IN ('cvs', 'screenshots')
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid())
  )
  WITH CHECK (
    bucket_id IN ('cvs', 'screenshots')
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid())
  );

-- ----------------------------------------------------------------------------
-- 7. Seed data — one JD for the demo
-- ----------------------------------------------------------------------------
INSERT INTO public.job_descriptions
  (title, department, location, body_markdown, must_have, nice_to_have, weights, threshold)
VALUES (
  'Full Stack Developer',
  'Engineering',
  'Bangkok, Thailand (Hybrid)',
$$# Full Stack Developer — Hotel Plus

We are looking for a Full Stack Developer to help us build internal tools
that power Hotel Plus's revenue management and operational consulting work
for boutique hotels across Southeast Asia.

## What you will do
- Ship features end-to-end across the stack (database to UI).
- Integrate AI into recruiting, revenue, and ops workflows.
- Own the developer experience: testing, deploys, observability.
- Pair with our consulting team to translate workflows into software.

## You probably have
- 3+ years building production web apps with TypeScript.
- Comfort with React (App Router) and a Postgres-flavored database.
- Experience integrating a modern LLM API in production.
- A taste for clean architecture and reviewable PRs.

## Bonus
- Worked at a hospitality / travel / B2B-SaaS company.
- Experience with calendar / email API integrations (Google, Microsoft).
- Built or contributed to a design system.

## How we work
- Small team. Async first. Bangkok + remote.
- We hire for trajectory; we promote on judgment.
$$,
  '["TypeScript","React","Node.js","SQL","API design","Git"]'::jsonb,
  '["Next.js","Tailwind","Supabase","Claude/OpenAI integration","Google Calendar API","Gmail API"]'::jsonb,
  '{"skills":0.4,"experience":0.4,"culture":0.2}'::jsonb,
  7.0
);

-- ============================================================================
-- END
-- ============================================================================
