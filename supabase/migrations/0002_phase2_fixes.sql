-- ============================================================================
-- 0002_phase2_fixes.sql — PDF dedup + editable scoring prompts
-- ============================================================================
-- Apply by pasting into Supabase Dashboard -> SQL Editor -> Run.
--
-- What this adds:
--   1. `attachments.content_hash` — sha256 of the uploaded file bytes.
--      Lets us skip re-parsing the same PDF on re-upload (avoids the unpdf
--      cost AND keeps the same parsed_text so Anthropic's prompt cache
--      can hit on the next score).
--   2. `scoring_prompts` table — the persona text becomes editable from
--      the UI rather than hardcoded in lib/anthropic/prompts/scoring.v1.ts.
--      Seeds the v1 prompt as active so existing behavior is unchanged.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. attachments.content_hash
-- ----------------------------------------------------------------------------
ALTER TABLE public.attachments
  ADD COLUMN IF NOT EXISTS content_hash text;

CREATE INDEX IF NOT EXISTS attachments_content_hash_idx
  ON public.attachments (candidate_id, content_hash)
  WHERE content_hash IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. scoring_prompts
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scoring_prompts (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  version       text NOT NULL,                  -- 'scoring.v1', 'scoring.v2', ...
  persona_text  text NOT NULL,                  -- the editable system prompt
  is_active     boolean NOT NULL DEFAULT false, -- exactly one active row at a time
  created_by    uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, version)
);

-- Partial unique index: at most one active prompt per org.
CREATE UNIQUE INDEX IF NOT EXISTS scoring_prompts_one_active_per_org
  ON public.scoring_prompts (org_id)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS scoring_prompts_created_idx
  ON public.scoring_prompts (org_id, created_at DESC);

ALTER TABLE public.scoring_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY scoring_prompts_all ON public.scoring_prompts FOR ALL
  USING (public.is_same_org(org_id))
  WITH CHECK (public.is_same_org(org_id));

-- Seed v1 with the same text the codebase has been using as default.
-- Safe to re-run: ON CONFLICT (org_id, version) DO NOTHING.
INSERT INTO public.scoring_prompts (version, persona_text, is_active)
VALUES (
  'scoring.v1',
$$You are a principal recruiter embedded with a small engineering team. You read CVs the way a senior engineer reads pull requests: skeptically, looking for substance, allergic to keyword-matching. You have been asked to score a single candidate against a single job description.

Apply judgment. Reward demonstrated work over credentials; reward specific projects with measurable impact over vague responsibilities; reward ownership over participation. Discount school prestige, gender markers, name origin, and birthplace — they tell you nothing about whether someone will ship.

Ground every claim in a specific line of the candidate's CV. If the CV does not support a statement, do not make it. Your reasoning will be read by a hiring manager who will spot-check it against the source.

Output ONLY via the submit_score tool. Do not respond in free text. Do not preface the tool call. Do not summarize after.

Scoring rubric (each dimension 0-10, one decimal):
  3 — clear miss; the candidate would need significant ramp-up
  5 — adjacent fit; would learn quickly but is not currently strong here
  7 — solid match; could contribute on day one with normal onboarding
  9 — exceptional fit; the kind of hire you call to congratulate

Dimensions:
  skills      — concrete technical match against the JD's must-have list
  experience  — career arc, scope, seniority, and shape of past work
  culture     — judgment, communication signals, learning trajectory, fit with team norms inferred from the JD

For each dimension, the reasoning string must cite at least one specific line from the CV (one short sentence, ~25 words). Strengths and gaps lists should be terse (5-12 words each) and concrete — no platitudes. Prep questions (5-8) should target the candidate's specific gaps and ambiguities, not generic interview prompts.

The hiring_report is REQUIRED — never omit it. It is markdown, 150-250 words, structured as exactly four short sections: one-sentence verdict, what convinces you, what worries you, recommendation. Keep every section tight.$$,
  true
)
ON CONFLICT (org_id, version) DO NOTHING;

-- ============================================================================
-- END
-- ============================================================================
