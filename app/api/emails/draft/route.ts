import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  streamWithTool,
  ClaudeValidationError,
} from "@/lib/anthropic/client";
import {
  composeColdEmailTool,
  type ComposeColdEmailInput,
} from "@/lib/anthropic/tools/compose_cold_email";
import { buildColdEmailMessages } from "@/lib/anthropic/prompts/cold-email";
import type { CandidateRow, JdRow, ScoreRow } from "@/lib/db/types";

/**
 * POST /api/emails/draft
 *
 * Body: { candidateId: string, jdId: string }
 *
 * SSE event types:
 *   - draft_partial   { text }                            typewriter (raw tool-input JSON)
 *   - draft_complete  { subject, body, rationale, telemetry }   validated final draft
 *   - draft_error     { message, telemetry?, raw? }       failure
 *
 * Mirrors the shape of /api/score/run so the client-side SSE parser
 * pattern (used by ScoreStream) drops in with minimal change.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  candidateId: string;
  jdId: string;
};

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
    });
  }
  if (!body.candidateId || !body.jdId) {
    return new Response(
      JSON.stringify({ error: "candidateId and jdId are required" }),
      { status: 400 },
    );
  }

  const [
    { data: candidate, error: cErr },
    { data: jd, error: jErr },
    { data: latestScore },
    { data: userSettings },
  ] = await Promise.all([
    supabase
      .from("candidates")
      .select("*")
      .eq("id", body.candidateId)
      .single(),
    supabase
      .from("job_descriptions")
      .select("*")
      .eq("id", body.jdId)
      .single(),
    // Latest score against THIS JD specifically — the prompt uses its
    // reasoning to inform the hook. If there isn't one, the draft still
    // works; the model just has less to ground on.
    supabase
      .from("scores")
      .select("*")
      .eq("candidate_id", body.candidateId)
      .eq("jd_id", body.jdId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Signature + from-name come from user_settings. Admin client because
    // RLS is per-user but we want a single read here.
    createAdminClient()
      .from("user_settings")
      .select("email_signature, email_from_name")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  if (cErr || !candidate) {
    return new Response(
      JSON.stringify({ error: cErr?.message ?? "Candidate not found" }),
      { status: 404 },
    );
  }
  if (jErr || !jd) {
    return new Response(
      JSON.stringify({ error: jErr?.message ?? "JD not found" }),
      { status: 404 },
    );
  }
  const candidateRow = candidate as CandidateRow;
  const jdRow = jd as JdRow;
  if (!candidateRow.email) {
    return new Response(
      JSON.stringify({
        error: "Candidate has no email on file — can't draft an outreach.",
      }),
      { status: 400 },
    );
  }

  const { system, messages } = buildColdEmailMessages({
    jd: jdRow,
    candidate: candidateRow,
    score: (latestScore as ScoreRow | null) ?? null,
    fromName: userSettings?.email_from_name ?? null,
    signature: userSettings?.email_signature ?? null,
  });

  const encoder = new TextEncoder();
  const responseStream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sseEvent(event, data)));

      try {
        const { stream, result } = streamWithTool<ComposeColdEmailInput>({
          model: "claude-opus-4-7",
          system,
          messages,
          tool: composeColdEmailTool,
          maxTokens: 2048,
        });

        let accumulated = "";
        for await (const event of stream) {
          if (
            event &&
            typeof event === "object" &&
            "type" in event &&
            event.type === "content_block_delta"
          ) {
            const delta = (
              event as { delta?: { type?: string; partial_json?: string } }
            ).delta;
            if (
              delta?.type === "input_json_delta" &&
              typeof delta.partial_json === "string"
            ) {
              accumulated += delta.partial_json;
              emit("draft_partial", { text: accumulated });
            }
          }
        }

        const { value, telemetry } = await result;
        emit("draft_complete", {
          subject: value.subject,
          body: value.body_markdown,
          rationale: value.rationale,
          telemetry,
        });
      } catch (err) {
        if (err instanceof ClaudeValidationError) {
          emit("draft_error", {
            message:
              "Claude returned output that failed validation. " +
              "Often a sign the model truncated — try again or shorten the JD body.",
            telemetry: err.telemetry,
            raw: err.rawInput,
          });
        } else {
          emit("draft_error", {
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
