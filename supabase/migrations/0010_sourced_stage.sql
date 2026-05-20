-- Phase 3d follow-up — first-class stage for outbound-sourced candidates
--
-- Outbound candidates (from the JD "Find candidates" dialog or the
-- bookmarklet) shouldn't share the "Applied" column with inbound
-- applicants. Inbound = candidate expressed interest. Outbound = we
-- found them, they haven't been contacted yet. Different funnel
-- behaviors, different next actions.
--
-- New stage 'sourced' sits BEFORE 'applied' in the enum order, which
-- also matches the desired Kanban column order. HR's manual progression
-- when an outbound candidate replies / engages: drag from Sourced to
-- Applied (or skip straight to Screening).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'sourced'
      AND enumtypid = 'public.candidate_stage'::regtype
  ) THEN
    ALTER TYPE public.candidate_stage ADD VALUE 'sourced' BEFORE 'applied';
  END IF;
END$$;
