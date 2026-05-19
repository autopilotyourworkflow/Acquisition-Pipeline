import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  cancelInterviewEvent,
  GoogleNotConnectedError,
  rescheduleInterviewEvent,
} from "@/lib/google/calendar";
import { withAudit } from "@/lib/audit/wrap";
import { ORG_ID } from "@/lib/db/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CV_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30;

const PatchBody = z.object({
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  notes: z.string().optional(),
});

/**
 * DELETE = cancel the interview. Soft-cancels in our DB (status='canceled')
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
          .update({ status: "canceled" })
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data;
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Database update failed",
      },
      { status: 500 },
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

  let cvUrl: string | null = null;
  const { data: latestAttachment } = await supabase
    .from("attachments")
    .select("storage_path")
    .eq("candidate_id", candidate.id)
    .eq("kind", "cv_pdf")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestAttachment) {
    const admin = createAdminClient();
    const { data: signed } = await admin.storage
      .from("cvs")
      .createSignedUrl(
        latestAttachment.storage_path as string,
        CV_SIGNED_URL_TTL_SECONDS,
      );
    if (signed?.signedUrl) cvUrl = signed.signedUrl;
  }

  const candidatePortfolioUrl =
    (candidate.linkedin_url as string | null) ??
    (candidate.source_url as string | null) ??
    null;

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
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Database update failed",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    meetUrl: rescheduleResult.meetUrl,
  });
}
