import type { SupabaseClient } from "@supabase/supabase-js";
import { withAudit, computeRowHash } from "@/lib/audit/wrap";
import { ORG_ID } from "@/lib/db/constants";
import { CANDIDATE_STAGES, type CandidateStage } from "@/lib/db/enums";

/**
 * Brief Module-4 line: "เปลี่ยน / ยกเลิกนัดได้ พร้อม update สถานะใน
 * Applicant Tracker โดยอัตโนมัติ" — scheduling and cancelling an interview
 * should reflect in the candidate's Kanban stage automatically. These two
 * helpers do exactly that, via the same withAudit spine every other mutation
 * uses, so the activity log + undo backbone still picks the change up.
 *
 * Both helpers are deliberately conservative: they only move a candidate
 * FORWARD on schedule (never demote someone who's already at offer/hired),
 * and only roll BACK on cancel if the candidate is sitting at the very
 * stage that was just cancelled (i.e. the interview is what put them there).
 *
 * Terminal stages (hired, rejected) are sticky — interview activity doesn't
 * pull a candidate out of either one.
 */

const STAGE_INDEX: Record<CandidateStage, number> = Object.fromEntries(
  CANDIDATE_STAGES.map((s, i) => [s, i]),
) as Record<CandidateStage, number>;

const TERMINAL_STAGES = new Set<CandidateStage>(["hired", "rejected"]);

/**
 * Advance the candidate to `interviewStage` when scheduling, but only if
 * their current stage is strictly earlier in the funnel and they're not
 * already at a terminal stage. No-op when already at or past `interviewStage`.
 */
export async function advanceCandidateStageForInterview(args: {
  supabase: SupabaseClient;
  userId: string;
  candidateId: string;
  interviewStage: CandidateStage;
}): Promise<void> {
  const { supabase, userId, candidateId, interviewStage } = args;

  const { data: before } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", candidateId)
    .single();
  if (!before) return;

  const currentStage = before.stage as CandidateStage;
  if (TERMINAL_STAGES.has(currentStage)) return;
  if (STAGE_INDEX[currentStage] >= STAGE_INDEX[interviewStage]) return;

  await withAudit({
    actorId: userId,
    orgId: ORG_ID,
    action: "update",
    table: "candidates",
    targetId: candidateId,
    before,
    mutate: async () => {
      const provisional = { ...before, stage: interviewStage };
      const row_hash = computeRowHash(provisional);
      const { data, error } = await supabase
        .from("candidates")
        .update({ stage: interviewStage, row_hash })
        .eq("id", candidateId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Roll the candidate back to `screening` when an interview is cancelled,
 * but only if the candidate is sitting at the exact stage that was just
 * cancelled. If they've moved on (or back) since, leave them alone.
 *
 * Terminal stages and pre-interview stages are no-ops.
 */
export async function rollbackCandidateStageForCancelledInterview(args: {
  supabase: SupabaseClient;
  userId: string;
  candidateId: string;
  cancelledInterviewStage: CandidateStage;
}): Promise<void> {
  const { supabase, userId, candidateId, cancelledInterviewStage } = args;

  // Only roll back from real interview stages — scheduling a cancellation
  // against an `applied`/`screening`-tagged interview shouldn't unwind
  // anything, since the candidate wasn't moved by the booking either.
  if (
    cancelledInterviewStage !== "prescreen_call" &&
    cancelledInterviewStage !== "first_interview"
  ) {
    return;
  }

  const { data: before } = await supabase
    .from("candidates")
    .select("*")
    .eq("id", candidateId)
    .single();
  if (!before) return;

  const currentStage = before.stage as CandidateStage;
  if (TERMINAL_STAGES.has(currentStage)) return;
  if (currentStage !== cancelledInterviewStage) return;

  await withAudit({
    actorId: userId,
    orgId: ORG_ID,
    action: "update",
    table: "candidates",
    targetId: candidateId,
    before,
    mutate: async () => {
      const provisional = { ...before, stage: "screening" as CandidateStage };
      const row_hash = computeRowHash(provisional);
      const { data, error } = await supabase
        .from("candidates")
        .update({ stage: "screening", row_hash })
        .eq("id", candidateId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
  });
}
