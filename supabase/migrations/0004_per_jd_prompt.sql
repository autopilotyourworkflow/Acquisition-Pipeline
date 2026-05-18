-- ============================================================================
-- 0004_per_jd_prompt.sql — optional per-JD scoring persona override
-- ============================================================================
-- Apply by pasting into Supabase Dashboard -> SQL Editor -> Run.
--
-- Adds an optional `scoring_persona_override` text column to job_descriptions.
-- When non-null, /api/score/run uses this persona instead of the global active
-- prompt from `scoring_prompts`. Lets HR write role-specific scoring guidance
-- (e.g., "for senior engineering roles, weight ownership over breadth").
-- ============================================================================

ALTER TABLE public.job_descriptions
  ADD COLUMN IF NOT EXISTS scoring_persona_override text;

-- ============================================================================
-- END
-- ============================================================================
