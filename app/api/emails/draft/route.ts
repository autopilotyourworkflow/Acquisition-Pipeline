import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  streamWithTool,
  ClaudeValidationError,
  type ModelId,
} from "@/lib/anthropic/client";
import {
  composeColdEmailTool,
  type ComposeColdEmailInput,
} from "@/lib/anthropic/tools/compose_cold_email";
import {
  buildColdEmailMessages,
  resolveColdEmailLanguage,
  type ColdEmailLanguage,
} from "@/lib/anthropic/prompts/cold-email";
import { ORG_ID } from "@/lib/db/constants";
import type { CandidateRow, JdRow, ScoreRow } from "@/lib/db/types";

/**
 * POST /api/emails/draft
 *
 * Body: {
 *   candidateId: string,
 *   jdId: string,
 *   model?: 'claude-opus-4-7' | 'claude-haiku-4-5',
 *   language?: 'th' | 'en' | 'auto'
 * }
 *
 * SSE event types:
 *   - draft_partial   { text }                                       typewriter (raw tool-input JSON)
 *   - draft_complete  { emailId, subject, body, rationale, telemetry, model, language }
 *   - draft_error     { message, telemetry?, raw? }                  failure
 *
 * On successful streaming, the route auto-persists a `drafted` row in
 * the `emails` table BEFORE emitting draft_complete. The client gets
 * the new row's id back as `emailId` so it can later send-by-update
 * rather than send-by-insert (keeps the email count clean for users
 * who try multiple drafts before sending one).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = {
  candidateId: string;
  jdId: string;
  model?: ModelId;
  language?: ColdEmailLanguage;
};

const ALLOWED_MODELS: ModelId[] = ["claude-opus-4-7", "claude-haiku-4-5"];
const DEFAULT_MODEL: ModelId = "claude-opus-4-7";
const DEFAULT_LANGUAGE: ColdEmailLanguage = "th";

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

  const model: ModelId =
    body.model && ALLOWED_MODELS.includes(body.model) ? body.model : DEFAULT_MODEL;
  const languagePref: ColdEmailLanguage =
    body.language === "th" || body.language === "en" || body.language === "auto"
      ? body.language
      : DEFAULT_LANGUAGE;

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
    supabase
      .from("scores")
      .select("*")
      .eq("candidate_id", body.candidateId)
      .eq("jd_id", body.jdId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
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

  // Resolve the language preference against the candidate's detected
  // language. `auto` picks Thai for Thai-detected profiles, English otherwise.
  const detectedLang =
    typeof candidateRow.raw_profile?.detected_language === "string"
      ? (candidateRow.raw_profile.detected_language as string)
      : null;
  const targetLanguage = resolveColdEmailLanguage(languagePref, detectedLang);

  const { system, messages } = buildColdEmailMessages({
    jd: jdRow,
    candidate: candidateRow,
    score: (latestScore as ScoreRow | null) ?? null,
    fromName: userSettings?.email_from_name ?? null,
    signature: userSettings?.email_signature ?? null,
    targetLanguage,
  });

  const encoder = new TextEncoder();
  const responseStream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(sseEvent(event, data)));

      try {
        const { stream, result } = streamWithTool<ComposeColdEmailInput>({
          model,
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

        // Autosave the draft so the user can pick it from history later
        // even if they close without sending. Failure here doesn't block
        // the response — the user still sees the draft in the dialog.
        let emailId: string | null = null;
        try {
          const admin = createAdminClient();
          const { data: inserted } = await admin
            .from("emails")
            .insert({
              org_id: ORG_ID,
              candidate_id: body.candidateId,
              jd_id: body.jdId,
              user_id: user.id,
              status: "drafted",
              subject: value.subject,
              body_markdown: value.body_markdown,
              rationale: value.rationale,
            })
            .select("id")
            .single();
          emailId = inserted?.id ?? null;
        } catch (err) {
          console.error("[/api/emails/draft] autosave failed", err);
        }

        emit("draft_complete", {
          emailId,
          subject: value.subject,
          body: value.body_markdown,
          rationale: value.rationale,
          telemetry,
          model,
          language: targetLanguage,
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
