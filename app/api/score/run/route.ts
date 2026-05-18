import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { streamWithTool } from "@/lib/anthropic/client";
import { submitScoreTool, type SubmitScoreInput } from "@/lib/anthropic/tools/submit_score";
import { PROMPT_VERSION, buildScoringMessages } from "@/lib/anthropic/prompts/scoring.v1";
import { ORG_ID } from "@/lib/db/constants";
import type { CandidateRow, JdRow } from "@/lib/db/types";

/**
 * POST /api/score/run
 * Body: { candidateId: string, jdId: string }
 *
 * Streams Server-Sent Events with three event types:
 *   - score_partial: { text: <accumulated_tool_input_string> }
 *       Periodic updates so the UI can show that Claude is working.
 *   - score_complete: { scoreId, value, telemetry }
 *       Final validated score with the scores.id persisted in Postgres.
 *   - score_error: { message }
 *
 * Node runtime required (unpdf and the Anthropic SDK both depend on Node APIs).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = { candidateId: string; jdId: string };

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function buildCandidateText(candidate: CandidateRow, parsedCv: string | null): string {
  // Prefer parsed CV text; fall back to whatever structured signal we have.
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

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }
  if (!body.candidateId || !body.jdId) {
    return new Response(
      JSON.stringify({ error: "candidateId and jdId are required" }),
      { status: 400 },
    );
  }

  // Fetch candidate + JD + most-recent CV parsed_text in parallel.
  const [
    { data: candidate, error: cErr },
    { data: jd, error: jErr },
    { data: cv },
  ] = await Promise.all([
    supabase.from("candidates").select("*").eq("id", body.candidateId).single(),
    supabase.from("job_descriptions").select("*").eq("id", body.jdId).single(),
    supabase
      .from("attachments")
      .select("parsed_text")
      .eq("candidate_id", body.candidateId)
      .eq("kind", "cv_pdf")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (cErr || !candidate) {
    return new Response(JSON.stringify({ error: cErr?.message ?? "Candidate not found" }), {
      status: 404,
    });
  }
  if (jErr || !jd) {
    return new Response(JSON.stringify({ error: jErr?.message ?? "JD not found" }), {
      status: 404,
    });
  }

  const candidateRow = candidate as CandidateRow;
  const jdRow = jd as JdRow;
  const candidateText = buildCandidateText(candidateRow, cv?.parsed_text ?? null);

  const { system, messages } = buildScoringMessages({
    jdTitle: jdRow.title,
    jdBody: jdRow.body_markdown,
    jdMustHave: jdRow.must_have,
    jdNiceToHave: jdRow.nice_to_have,
    candidateName: candidateRow.full_name,
    candidateText,
  });

  const { stream, result } = streamWithTool<SubmitScoreInput>({
    model: "claude-opus-4-7",
    system,
    messages,
    tool: submitScoreTool,
    maxTokens: 8192,
  });

  const encoder = new TextEncoder();
  const responseStream = new ReadableStream({
    async start(controller) {
      let accumulated = "";
      try {
        for await (const event of stream) {
          // Anthropic's stream events: we only care about input_json_delta for the
          // tool_use content block — that's the streaming structured output.
          if (
            event &&
            typeof event === "object" &&
            "type" in event &&
            event.type === "content_block_delta"
          ) {
            const delta = (event as { delta?: { type?: string; partial_json?: string } }).delta;
            if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") {
              accumulated += delta.partial_json;
              controller.enqueue(
                encoder.encode(sseEvent("score_partial", { text: accumulated })),
              );
            }
          }
        }

        const { value, telemetry } = await result;

        // Persist the score row.
        const admin = createAdminClient();
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
            prompt_version: PROMPT_VERSION,
            input_tokens: telemetry.input_tokens,
            output_tokens: telemetry.output_tokens,
            cost_usd: Number(telemetry.cost_usd.toFixed(4)),
            created_by: user.id,
          })
          .select()
          .single();

        if (insertErr || !scoreRow) {
          controller.enqueue(
            encoder.encode(
              sseEvent("score_error", {
                message: `Score generated but DB persist failed: ${insertErr?.message ?? "unknown"}`,
                value,
              }),
            ),
          );
        } else {
          controller.enqueue(
            encoder.encode(
              sseEvent("score_complete", {
                scoreId: scoreRow.id,
                value,
                telemetry,
                weighted_total: scoreRow.weighted_total,
              }),
            ),
          );
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            sseEvent("score_error", {
              message: err instanceof Error ? err.message : "Unknown error",
            }),
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(responseStream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
