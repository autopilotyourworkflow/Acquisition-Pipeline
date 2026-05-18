-- ============================================================================
-- 0003_team_scoring.sql — team scoring mode + per-agent telemetry
-- ============================================================================
-- Apply by pasting into Supabase Dashboard -> SQL Editor -> Run.
--
-- Adds two columns to `scores`:
--   - `scoring_mode` ('single' | 'team') — which evaluation strategy produced
--     this row. Single = one Claude call with tool-use forcing. Team = three
--     scorer agents at temperatures 0/0.3/0.6 + a manager agent that
--     consolidates them into the final score.
--   - `team_agents` (jsonb) — per-agent telemetry breakdown when scoring_mode
--     = 'team'. Lets us audit which agent influenced what.
-- ============================================================================

ALTER TABLE public.scores
  ADD COLUMN IF NOT EXISTS scoring_mode text NOT NULL DEFAULT 'single';

-- CHECK constraint guards the enum-ish field. Drop+re-add so re-running the
-- migration is safe.
ALTER TABLE public.scores
  DROP CONSTRAINT IF EXISTS scores_scoring_mode_check;
ALTER TABLE public.scores
  ADD CONSTRAINT scores_scoring_mode_check
  CHECK (scoring_mode IN ('single', 'team'));

ALTER TABLE public.scores
  ADD COLUMN IF NOT EXISTS team_agents jsonb;

-- ============================================================================
-- END
-- ============================================================================
