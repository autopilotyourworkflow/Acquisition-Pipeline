import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  streamWithTool,
  ClaudeValidationError,
  type ClaudeTelemetry,
  type ModelId,
} from "@/lib/anthropic/client";
import { submitScoreTool, type SubmitScoreInput } from "@/lib/anthropic/tools/submit_score";
import {
  loadActiveScoringPrompt,
  buildScoringMessagesWithPersona,
} from "@/lib/anthropic/prompts/load";
import { ORG_ID } from "@/lib/db/constants";
import type { CandidateRow, JdRow } from "@/lib/db/types";

/**
 * POST /api/score/run
 * Body: { candidateId, jdId, model? ('claude-opus-4-7' | 'claude-haiku-4-5') }
 *
 * Streams Server-Sent Events:
 *   - score_partial { text }                              — typewriter view
 *   - score_complete { scoreId, value, telemetry, ... }   — final result
 *   - score_error    { message, telemetry?, raw? }        — failure, with cost
 *                                                            if tokens were spent
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = { candidateId: string; jdId: string; model?: ModelId };

const ALLOWED_MODELS: ModelId[] = ["claude-opus-4-7", "claude-haiku-4-5"];
const DEFAULT_MODEL: ModelId = "claude-haiku-4-5"; // cheap by default; UI exposes Opus

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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

  const model: ModelId =
    body.model && ALLOWED_MODELS.includes(body.model) ? body.model : DEFAULT_MODEL;

  const [
    { data: candidate, error: cErr },
    { data: jd, error: jErr },
    { data: cv },
    activePrompt,
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
    loadActiveScoringPrompt(),
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

  const { system, messages } = buildScoringMessagesWithPersona(activePrompt.personaText, {
    jdTitle: jdRow.title,
    jdBody: jdRow.body_markdown,
    jdMustHave: jdRow.must_have,
    jdNiceToHave: jdRow.nice_to_have,
    candidateName: candidateRow.full_name,
    candidateText,
  });

  const { stream, result } = streamWithTool<SubmitScoreInput>({
    model,
    system,
    messages,
    tool: submitScoreTool,
    maxTokens: 8192,
    temperature: 0,
  });

  const encoder = new TextEncoder();
  const responseStream = new ReadableStream({
    async start(controller) {
      let accumulated = "";
      const emit = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sseEvent(event, data)));

      try {
        for await (const event of stream) {
          if (
            event &&
            typeof event === "object" &&
            "type" in event &&
            event.type === "content_block_delta"
          ) {
            const delta = (event as { delta?: { type?: string; partial_json?: string } }).delta;
            if (delta?.type === "input_json_delta" && typeof delta.partial_json === "string") {
              accumulated += delta.partial_json;
              emit("score_partial", { text: accumulated, model });
            }
          }
        }

        const { value, telemetry } = await result;

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
            prompt_version: activePrompt.version,
            input_tokens: telemetry.input_tokens,
            output_tokens: telemetry.output_tokens,
            cost_usd: Number(telemetry.cost_usd.toFixed(4)),
            created_by: user.id,
          })
          .select()
          .single();

        if (insertErr || !scoreRow) {
          emit("score_error", {
            message: `Score generated but DB persist failed: ${insertErr?.message ?? "unknown"}`,
            telemetry,
            value,
          });
        } else {
          emit("score_complete", {
            scoreId: scoreRow.id,
            value,
            telemetry,
            weighted_total: scoreRow.weighted_total,
            prompt_version: activePrompt.version,
          });
        }
      } catch (err) {
        // ClaudeValidationError carries the telemetry through — surface it so
        // the UI can show "X tokens / $Y spent on a failed score".
        if (err instanceof ClaudeValidationError) {
          emit("score_error", {
            message:
              "Claude returned output that failed validation. " +
              "Often a sign the model truncated the JSON — try a different model or shorter prompt.",
            telemetry: err.telemetry,
            issues: err.issues,
            raw: err.rawInput,
          });
        } else {
          // Other errors (network, auth, etc.) — telemetry not available.
          let telemetry: ClaudeTelemetry | undefined;
          if (
            typeof err === "object" &&
            err !== null &&
            "telemetry" in err &&
            (err as { telemetry: unknown }).telemetry
          ) {
            telemetry = (err as { telemetry: ClaudeTelemetry }).telemetry;
          }
          emit("score_error", {
            message: err instanceof Error ? err.message : "Unknown error",
            telemetry,
          });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(responseStream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
