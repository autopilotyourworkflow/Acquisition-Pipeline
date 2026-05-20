-- Phase 3d — outbound sourcing + JobsDB inbound

-- New candidate sources. `jobsdb` was reserved in 0001 already; the inbound
-- /scraper tab finally puts it to use. `outbound_sourced` flags candidates
-- pulled from a /jds/[id] "Find candidates" sourcing run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'outbound_sourced'
      AND enumtypid = 'public.candidate_source'::regtype
  ) THEN
    ALTER TYPE public.candidate_source ADD VALUE 'outbound_sourced';
  END IF;
END$$;

-- Per-user encrypted SerpAPI key for the JobsDB Google search backbone.
-- Same AES-256-GCM helper (OAUTH_ENCRYPTION_SECRET) as the Proxycurl key.
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS serpapi_key_encrypted bytea;

-- One row per sourcing run. Captures the audit trail for cost + results
-- so we can render a "Last 5 runs" panel on the JD detail page and so the
-- /activity log isn't polluted with N candidate-insert rows per run with
-- no surrounding context.
CREATE TABLE IF NOT EXISTS public.sourcing_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  jd_id         uuid NOT NULL REFERENCES public.job_descriptions(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  platforms     text[] NOT NULL,
  n_requested   integer NOT NULL,
  n_found       integer NOT NULL DEFAULT 0,
  cost_usd      numeric(10,4) NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'running' CHECK (status IN ('running','done','failed')),
  started_at    timestamptz NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  error         text,
  row_hash      text,
  derived_query jsonb
);

CREATE INDEX IF NOT EXISTS idx_sourcing_runs_jd_started
  ON public.sourcing_runs (jd_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sourcing_runs_user_started
  ON public.sourcing_runs (user_id, started_at DESC);

ALTER TABLE public.sourcing_runs ENABLE ROW LEVEL SECURITY;

-- Org-scoped via the JD's org_id. Anyone in the org with access to the JD
-- can see the run. Inserts/updates restricted to the user who owns the run
-- (orchestrator writes them via service-role anyway, but the policy is the
-- belt-and-suspenders.)
CREATE POLICY sourcing_runs_org_read ON public.sourcing_runs FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY sourcing_runs_self_write ON public.sourcing_runs FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
