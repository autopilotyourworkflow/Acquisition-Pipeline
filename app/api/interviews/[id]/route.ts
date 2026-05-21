import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  cancelInterviewEvent,
  GoogleNotConnectedError,
  rescheduleInterviewEvent,
} from "@/lib/google/calendar";
import { withAudit } from "@/lib/audit/wrap";
import { ORG_ID } from "@/lib/db/constants";
import { createShortLink } from "@/lib/short-links";
import { getCandidateCvInviteUrl } from "@/lib/interviews/cv-link";
import { rollbackCandidateStageForCancelledInterview } from "@/lib/interviews/candidate-stage-sync";
import type { CandidateStage } from "@/lib/db/enums";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CV_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30;
const PREP_LINK_TTL_SECONDS = 60 * 60 * 24 * 30;

function appBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv && fromEnv.trim()) return fromEnv.replace(/\/+$/, "");
  return "http://localhost:3000";
}

const PatchBody = z.object({
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  notes: z.string().optional(),
});

/**
 * DELETE = cancel the interview. Soft-cancels in our DB (status='cancelled')
 * + sends a cancellation notification through Google to all attendees so
 * they get an "Event canceled" email.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: interview, error: fetchErr } = await supabase
    .from("interviews")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr || !interview) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  // Cancel on Google first. If that fails for connection reasons, return
  // 409 so the UI can prompt re-auth without leaving the DB row inconsistent
  // with reality.
  if (interview.google_event_id) {
    try {
      await cancelInterviewEvent({
        userId: user.id,
        eventId: interview.google_event_id as string,
        calendarId:
          (interview.google_calendar_id as string | null) ?? "primary",
      });
    } catch (err) {
      if (err instanceof GoogleNotConnectedError) {
        return NextResponse.json(
          { error: err.message, reason: err.reason },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          error:
            err instanceof Error
              ? err.message
              : "Couldn't cancel the Google Calendar event",
        },
        { status: 502 },
      );
    }
  }

  try {
    await withAudit({
      actorId: user.id,
      orgId: ORG_ID,
      action: "update",
      table: "interviews",
      targetId: id,
      before: interview,
      mutate: async () => {
        const { data, error } = await supabase
          .from("interviews")
          .update({ status: "cancelled" })
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data;
      },
    });
  } catch (err) {
    // Supabase throws PostgrestError as a plain object, not an Error subclass,
    // so `err instanceof Error` is false. Read .message off both shapes.
    const message =
      (err as { message?: string })?.message ?? "Database update failed";
    console.error("[interviews/:id] mutate failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Roll the candidate's tracker stage back to `screening` IF they're still
  // sitting at the stage this interview put them at. Conservative: don't
  // demote anyone who's already at offer/hired or has been moved further.
  try {
    await rollbackCandidateStageForCancelledInterview({
      supabase,
      userId: user.id,
      candidateId: interview.candidate_id as string,
      cancelledInterviewStage: interview.stage as CandidateStage,
    });
  } catch (stageErr) {
    console.error(
      "[interviews/:id] candidate stage rollback failed:",
      stageErr instanceof Error ? stageErr.message : stageErr,
    );
  }

  return NextResponse.json({ ok: true });
}

/**
 * PATCH = reschedule (and re-stamp notes). Updates the Google event's
 * start/end and description, then syncs the DB row.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid request body",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: interview, error: fetchErr } = await supabase
    .from("interviews")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr || !interview) {
    return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  }

  if (!interview.google_event_id) {
    return NextResponse.json(
      { error: "Interview has no Google Calendar event to update" },
      { status: 400 },
    );
  }

  // Pull candidate + JD + latest CV for re-stamping the description. Same
  // shape the create route uses, so the canceled and rescheduled descriptions
  // stay consistent.
  const { data: candidate } = await supabase
    .from("candidates")
    .select("id, full_name, email, phone, linkedin_url, source_url")
    .eq("id", interview.candidate_id as string)
    .single();
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  let jdTitle: string | null = null;
  if (interview.jd_id) {
    const { data: jdRow } = await supabase
      .from("job_descriptions")
      .select("title")
      .eq("id", interview.jd_id as string)
      .maybeSingle();
    jdTitle = (jdRow?.title as string | undefined) ?? null;
  }

  // Same CV-link path the create route uses — short /l/<slug> URL, not the
  // raw 400-char Supabase signed URL. Centralized in lib/interviews/cv-link.ts
  // so this path can't regress again.
  const cvUrl = await getCandidateCvInviteUrl({
    candidateId: candidate.id as string,
    userId: user.id,
    ttlSeconds: CV_SIGNED_URL_TTL_SECONDS,
  });

  const candidatePortfolioUrl =
    (candidate.linkedin_url as string | null) ??
    (candidate.source_url as string | null) ??
    null;

  // Mint a fresh short link for the staff-only prep page so the rescheduled
  // event's description still has a working prep link (the original one
  // would expire after 30 days; rescheduling restarts that clock).
  let prepUrl: string | null = null;
  try {
    const prepDestination = `${appBaseUrl()}/interviews/${id}/prep`;
    const shortLink = await createShortLink({
      url: prepDestination,
      ttlSeconds: PREP_LINK_TTL_SECONDS,
      userId: user.id,
    });
    prepUrl = shortLink.shortUrl;
  } catch (shortErr) {
    console.error(
      "[interviews/:id PATCH] prep short-link mint failed:",
      shortErr instanceof Error ? shortErr.message : shortErr,
    );
    prepUrl = `${appBaseUrl()}/interviews/${id}/prep`;
  }

  let rescheduleResult;
  try {
    rescheduleResult = await rescheduleInterviewEvent({
      userId: user.id,
      eventId: interview.google_event_id as string,
      calendarId:
        (interview.google_calendar_id as string | null) ?? "primary",
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      candidateName: candidate.full_name as string,
      candidateEmail: candidate.email as string | null,
      candidatePhone: candidate.phone as string | null,
      candidatePortfolioUrl,
      jdTitle,
      notes: body.notes,
      cvUrl,
      prepUrl,
    });
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) {
      return NextResponse.json(
        { error: err.message, reason: err.reason },
        { status: 409 },
      );
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Calendar update failed",
      },
      { status: 502 },
    );
  }

  try {
    await withAudit({
      actorId: user.id,
      orgId: ORG_ID,
      action: "update",
      table: "interviews",
      targetId: id,
      before: interview,
      mutate: async () => {
        const { data, error } = await supabase
          .from("interviews")
          .update({
            starts_at: body.startsAt,
            ends_at: body.endsAt,
            description: rescheduleResult.description,
            status: "scheduled",
          })
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data;
      },
    });
  } catch (err) {
    // Supabase throws PostgrestError as a plain object, not an Error subclass,
    // so `err instanceof Error` is false. Read .message off both shapes.
    const message =
      (err as { message?: string })?.message ?? "Database update failed";
    console.error("[interviews/:id] mutate failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    meetUrl: rescheduleResult.meetUrl,
  });
}
