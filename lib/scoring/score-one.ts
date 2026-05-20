/**
 * In-process single-mode scorer. Used by sourcing runs (and any future
 * background job) to score a candidate without round-tripping through the
 * SSE /api/score/run endpoint — which expects an authenticated user cookie
 * and streams to a UI client, neither of which a server-side orchestrator
 * has.
 *
 * Mirrors the persistence + telemetry shape of runSingleMode in
 * app/api/score/run/route.ts so the score row this writes is
 * indistinguishable from a UI-triggered single-mode score.
 */

import { callWithTool, type ModelId } from "@/lib/anthropic/client";
import { submitScoreTool, type SubmitScoreInput } from "@/lib/anthropic/tools/submit_score";
import {
  loadScoringPromptForJd,
  buildScoringMessagesWithPersona,
} from "@/lib/anthropic/prompts/load";
import { createAdminClient } from "@/lib/supabase/admin";
import { ORG_ID } from "@/lib/db/constants";
import type { CandidateRow, JdRow } from "@/lib/db/types";

export type ScoreOneResult = {
  scoreId: string;
  weighted_total: number | null;
  cost_usd: number;
};

export async function scoreCandidateSingle(input: {
  candidateId: string;
  jdId: string;
  userId: string;
  model?: ModelId;
}): Promise<ScoreOneResult> {
  const admin = createAdminClient();
  const model: ModelId = input.model ?? "claude-haiku-4-5";

  const [
    { data: candidate, error: cErr },
    { data: jd, error: jErr },
    { data: cv },
  ] = await Promise.all([
    admin.from("candidates").select("*").eq("id", input.candidateId).single(),
    admin.from("job_descriptions").select("*").eq("id", input.jdId).single(),
    admin
      .from("attachments")
      .select("parsed_text")
      .eq("candidate_id", input.candidateId)
      .eq("kind", "cv_pdf")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (cErr || !candidate) {
    throw new Error(`Candidate not found: ${input.candidateId}`);
  }
  if (jErr || !jd) {
    throw new Error(`JD not found: ${input.jdId}`);
  }

  const candidateRow = candidate as CandidateRow;
  const jdRow = jd as JdRow;
  const activePrompt = await loadScoringPromptForJd({
    id: jdRow.id,
    scoring_persona_override: jdRow.scoring_persona_override,
  });

  const candidateText = buildCandidateText(candidateRow, cv?.parsed_text ?? null);

  const { system, messages } = buildScoringMessagesWithPersona(activePrompt.personaText, {
    jdTitle: jdRow.title,
    jdBody: jdRow.body_markdown,
    jdMustHave: jdRow.must_have,
    jdNiceToHave: jdRow.nice_to_have,
    candidateName: candidateRow.full_name,
    candidateText,
  });

  const { value, telemetry } = await callWithTool<SubmitScoreInput>({
    model,
    system,
    messages,
    tool: submitScoreTool,
    maxTokens: 8192,
    temperature: 0,
  });

  const { data: scoreRow, error: insertErr } = await admin
    .from("scores")
    .insert({
      org_id: ORG_ID,
      candidate_id: candidateRow.id,
      jd_id: jdRow.id,
      skills_score: value.skills_score,
      experience_score: value.experience_score,
      culture_score: value.culture_score,
      reasoning: value.reasoning,
      strengths: value.strengths,
      gaps: value.gaps,
      prep_questions: value.prep_questions,
      hiring_report: value.hiring_report,
      model: telemetry.model,
      prompt_version: activePrompt.version,
      input_tokens: telemetry.input_tokens,
      output_tokens: telemetry.output_tokens,
      cost_usd: Number(telemetry.cost_usd.toFixed(4)),
      created_by: input.userId,
      scoring_mode: "single",
      team_agents: null,
    })
    .select("id, weighted_total")
    .single();

  if (insertErr || !scoreRow) {
    throw new Error(`Score persist failed: ${insertErr?.message ?? "unknown"}`);
  }

  return {
    scoreId: scoreRow.id as string,
    weighted_total: (scoreRow.weighted_total as number | null) ?? null,
    cost_usd: telemetry.cost_usd,
  };
}

function buildCandidateText(candidate: CandidateRow, parsedCv: string | null): string {
  if (parsedCv && parsedCv.trim().length > 100) return parsedCv;
  const lines: string[] = [];
  lines.push(`Name: ${candidate.full_name}`);
  if (candidate.current_title) lines.push(`Current title: ${candidate.current_title}`);
  if (candidate.location) lines.push(`Location: ${candidate.location}`);
  if (candidate.linkedin_url) lines.push(`LinkedIn: ${candidate.linkedin_url}`);
  if (candidate.notes) lines.push(`\nNotes:\n${candidate.notes}`);
  if (candidate.raw_profile) {
    lines.push(`\nProfile (JSON):\n${JSON.stringify(candidate.raw_profile, null, 2)}`);
  }
  return lines.join("\n");
}
