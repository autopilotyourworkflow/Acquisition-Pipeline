import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  callWithTool,
  streamWithTool,
  ClaudeValidationError,
  type ClaudeTelemetry,
  type ModelId,
} from "@/lib/anthropic/client";
import { submitScoreTool, type SubmitScoreInput } from "@/lib/anthropic/tools/submit_score";
import {
  loadScoringPromptForJd,
  buildScoringMessagesWithPersona,
} from "@/lib/anthropic/prompts/load";
import {
  MANAGER_SYSTEM_PROMPT,
  MANAGER_PROMPT_VERSION,
  buildManagerUserMessage,
} from "@/lib/anthropic/prompts/manager";
import { ORG_ID } from "@/lib/db/constants";
import type { CandidateRow, JdRow } from "@/lib/db/types";

/**
 * POST /api/score/run
 *
 * Body: {
 *   candidateId: string,
 *   jdId: string,
 *   model?: 'claude-opus-4-7' | 'claude-haiku-4-5',
 *   mode?: 'single' | 'team'
 * }
 *
 * SSE event types:
 *   - score_partial   { text }                         single-mode typewriter
 *   - team_progress   { stage, completed, total, ... } team-mode status
 *   - score_complete  { scoreId, value, telemetry }    final result
 *   - score_error     { message, telemetry?, raw? }    failure
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ScoringMode = "single" | "team";
type RequestBody = {
  candidateId: string;
  jdId: string;
  model?: ModelId;
  mode?: ScoringMode;
};

const ALLOWED_MODELS: ModelId[] = ["claude-opus-4-7", "claude-haiku-4-5"];
const DEFAULT_MODEL: ModelId = "claude-haiku-4-5";
const TEAM_TEMPERATURES = [0, 0.3, 0.6] as const;

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

function addTelemetry(a: ClaudeTelemetry, b: ClaudeTelemetry): ClaudeTelemetry {
  return {
    model: a.model,
    input_tokens: a.input_tokens + b.input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    cache_creation_input_tokens:
      a.cache_creation_input_tokens + b.cache_creation_input_tokens,
    cache_read_input_tokens: a.cache_read_input_tokens + b.cache_read_input_tokens,
    cost_usd: a.cost_usd + b.cost_usd,
    retries: a.retries + b.retries,
    duration_ms: Math.max(a.duration_ms, b.duration_ms),
  };
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
  const mode: ScoringMode = body.mode === "team" ? "team" : "single";

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
  // Per-JD prompt override first, then org-wide active, then file-based fallback.
  const activePrompt = await loadScoringPromptForJd({
    id: jdRow.id,
    scoring_persona_override: jdRow.scoring_persona_override,
  });
  const candidateText = buildCandidateText(candidateRow, cv?.parsed_text ?? null);

  const { system: scorerSystem, messages: scorerMessages } = buildScoringMessagesWithPersona(
    activePrompt.personaText,
    {
      jdTitle: jdRow.title,
      jdBody: jdRow.body_markdown,
      jdMustHave: jdRow.must_have,
      jdNiceToHave: jdRow.nice_to_have,
      candidateName: candidateRow.full_name,
      candidateText,
    },
  );

  const encoder = new TextEncoder();
  const responseStream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sseEvent(event, data)));

      try {
        if (mode === "team") {
          await runTeamMode({
            model,
            scorerSystem,
            scorerMessages,
            promptVersion: activePrompt.version,
            candidateId: candidateRow.id,
            jdId: jdRow.id,
            userId: user.id,
            emit,
          });
        } else {
          await runSingleMode({
            model,
            scorerSystem,
            scorerMessages,
            promptVersion: activePrompt.version,
            candidateId: candidateRow.id,
            jdId: jdRow.id,
            userId: user.id,
            emit,
          });
        }
      } catch (err) {
        // Top-level catch — single/team handlers already emit their own
        // score_error for known failure modes.
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
          emit("score_error", {
            message: err instanceof Error ? err.message : "Unknown error",
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

// ---------------------------------------------------------------------------
// Single-mode: stream the tool input as Claude generates it.
// ---------------------------------------------------------------------------

type ModeArgs = {
  model: ModelId;
  scorerSystem: Parameters<typeof streamWithTool>[0]["system"];
  scorerMessages: Parameters<typeof streamWithTool>[0]["messages"];
  promptVersion: string;
  candidateId: string;
  jdId: string;
  userId: string;
  emit: (event: string, data: unknown) => void;
};

async function runSingleMode(args: ModeArgs) {
  const { stream, result } = streamWithTool<SubmitScoreInput>({
    model: args.model,
    system: args.scorerSystem,
    messages: args.scorerMessages,
    tool: submitScoreTool,
    maxTokens: 8192,
    temperature: 0,
  });

  let accumulated = "";
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
        args.emit("score_partial", { text: accumulated, model: args.model });
      }
    }
  }

  const { value, telemetry } = await result;
  await persistAndComplete({
    args,
    value,
    telemetry,
    scoringMode: "single",
    teamAgents: null,
  });
}

// ---------------------------------------------------------------------------
// Team-mode: 3 scorers in parallel + 1 manager.
// ---------------------------------------------------------------------------

async function runTeamMode(args: ModeArgs) {
  args.emit("team_progress", {
    stage: "scorers_started",
    completed: 0,
    total: TEAM_TEMPERATURES.length,
    model: args.model,
  });

  // Run the three scorers in parallel. Use Promise.allSettled so a single
  // agent's failure doesn't blow up the whole team — we can still consolidate
  // from the survivors (with a minimum of 2).
  const scorerPromises = TEAM_TEMPERATURES.map((temperature, idx) =>
    callWithTool<SubmitScoreInput>({
      model: args.model,
      system: args.scorerSystem,
      messages: args.scorerMessages,
      tool: submitScoreTool,
      maxTokens: 8192,
      temperature,
    })
      .then((r) => {
        args.emit("team_progress", {
          stage: "scorer_done",
          agent: idx + 1,
          temperature,
          telemetry: r.telemetry,
        });
        return { idx, temperature, ok: true as const, ...r };
      })
      .catch((err) => {
        args.emit("team_progress", {
          stage: "scorer_failed",
          agent: idx + 1,
          temperature,
          message: err instanceof Error ? err.message : "Unknown error",
        });
        return { idx, temperature, ok: false as const, err };
      }),
  );

  const settled = await Promise.all(scorerPromises);
  const successful = settled.filter(
    (s): s is Extract<typeof s, { ok: true }> => s.ok,
  );

  if (successful.length < 2) {
    args.emit("score_error", {
      message: `Team scoring needs at least 2 healthy scorers; got ${successful.length}.`,
    });
    return;
  }

  // Manager pass: consolidate the surviving outputs.
  args.emit("team_progress", {
    stage: "manager_started",
    surviving: successful.length,
  });

  const managerInput = successful.map((s) => ({
    agent: s.idx + 1,
    temperature: s.temperature,
    output: s.value,
  }));

  const { value: managerValue, telemetry: managerTelemetry } = await callWithTool<SubmitScoreInput>(
    {
      model: args.model,
      system: [{ type: "text", text: MANAGER_SYSTEM_PROMPT }],
      messages: [
        {
          role: "user",
          content: buildManagerUserMessage(managerInput),
        },
      ],
      tool: submitScoreTool,
      maxTokens: 8192,
      temperature: 0,
    },
  );

  args.emit("team_progress", { stage: "manager_done", telemetry: managerTelemetry });

  // Aggregate telemetry: total tokens across all 4 calls, sum cost,
  // duration = max (calls were parallel).
  const aggregated: ClaudeTelemetry = successful.reduce(
    (acc, s) => addTelemetry(acc, s.telemetry),
    managerTelemetry,
  );

  // Per-agent breakdown for the team_agents JSONB column.
  const teamAgents = [
    ...successful.map((s) => ({
      agent: s.idx + 1,
      temperature: s.temperature,
      scores: {
        skills: s.value.skills_score,
        experience: s.value.experience_score,
        culture: s.value.culture_score,
      },
      telemetry: s.telemetry,
    })),
    {
      agent: "manager",
      manager_version: MANAGER_PROMPT_VERSION,
      scores: {
        skills: managerValue.skills_score,
        experience: managerValue.experience_score,
        culture: managerValue.culture_score,
      },
      telemetry: managerTelemetry,
    },
  ];

  await persistAndComplete({
    args,
    value: managerValue,
    telemetry: aggregated,
    scoringMode: "team",
    teamAgents,
  });
}

// ---------------------------------------------------------------------------
// Shared persistence + score_complete emission.
// ---------------------------------------------------------------------------

async function persistAndComplete(opts: {
  args: ModeArgs;
  value: SubmitScoreInput;
  telemetry: ClaudeTelemetry;
  scoringMode: ScoringMode;
  teamAgents: unknown[] | null;
}) {
  const admin = createAdminClient();
  const { data: scoreRow, error: insertErr } = await admin
    .from("scores")
    .insert({
      org_id: ORG_ID,
      candidate_id: opts.args.candidateId,
      jd_id: opts.args.jdId,
      skills_score: opts.value.skills_score,
      experience_score: opts.value.experience_score,
      culture_score: opts.value.culture_score,
      reasoning: opts.value.reasoning,
      strengths: opts.value.strengths,
      gaps: opts.value.gaps,
      prep_questions: opts.value.prep_questions,
      hiring_report: opts.value.hiring_report,
      model: opts.telemetry.model,
      prompt_version: opts.args.promptVersion,
      input_tokens: opts.telemetry.input_tokens,
      output_tokens: opts.telemetry.output_tokens,
      cost_usd: Number(opts.telemetry.cost_usd.toFixed(4)),
      created_by: opts.args.userId,
      scoring_mode: opts.scoringMode,
      team_agents: opts.teamAgents,
    })
    .select()
    .single();

  if (insertErr || !scoreRow) {
    opts.args.emit("score_error", {
      message: `Score generated but DB persist failed: ${insertErr?.message ?? "unknown"}`,
      telemetry: opts.telemetry,
      value: opts.value,
    });
    return;
  }

  opts.args.emit("score_complete", {
    scoreId: scoreRow.id,
    value: opts.value,
    telemetry: opts.telemetry,
    weighted_total: scoreRow.weighted_total,
    prompt_version: opts.args.promptVersion,
    scoring_mode: opts.scoringMode,
    team_agents: opts.teamAgents,
  });
}
