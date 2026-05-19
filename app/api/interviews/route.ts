import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createInterviewEvent,
  GoogleNotConnectedError,
} from "@/lib/google/calendar";
import { withAudit } from "@/lib/audit/wrap";
import { ORG_ID } from "@/lib/db/constants";
import { createShortLink } from "@/lib/short-links";

// 30-day TTL on CV signed URLs. The interview lifecycle (schedule → meet →
// follow-up) typically completes inside a month, so the link stays valid
// through the full flow without needing to refresh. Trade-off: a leaked
// invite gives 30 days of CV access — acceptable given the recipient is
// already an invited attendee.
const CV_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  candidateId: z.string().uuid(),
  jdId: z.string().uuid().nullable().optional(),
  stage: z.enum([
    "applied",
    "screening",
    "prescreen_call",
    "first_interview",
    "offer",
    "hired",
    "rejected",
  ]),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  description: z.string().optional(),
  externalInvitees: z.array(z.string().email()).optional(),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
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

  // Pull candidate (for name + email) and the latest score (for prep questions
  // that go into the calendar event description).
  const { data: candidate, error: cErr } = await supabase
    .from("candidates")
    .select("id, full_name, email, phone, linkedin_url, source_url, jd_id")
    .eq("id", body.candidateId)
    .single();
  if (cErr || !candidate) {
    return NextResponse.json(
      { error: cErr?.message ?? "Candidate not found" },
      { status: 404 },
    );
  }

  // Look up the JD title for the "Position" line in the invite. Prefer the
  // JD explicitly passed on the request; fall back to the candidate's
  // assigned JD.
  const jdIdForTitle = body.jdId ?? candidate.jd_id ?? null;
  let jdTitle: string | null = null;
  if (jdIdForTitle) {
    const { data: jdRow } = await supabase
      .from("job_descriptions")
      .select("title")
      .eq("id", jdIdForTitle)
      .maybeSingle();
    jdTitle = (jdRow?.title as string | undefined) ?? null;
  }

  // Pull the most recent CV attachment (if any) and mint a 30-day signed URL.
  // We embed this in the calendar event description so interviewers + the
  // candidate can open the CV without leaving their calendar client.
  let cvUrl: string | null = null;
  const { data: latestAttachment } = await supabase
    .from("attachments")
    .select("storage_path, kind")
    .eq("candidate_id", body.candidateId)
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
    if (signed?.signedUrl) {
      // Wrap the long signed URL behind a short /l/<slug> link so the
      // calendar invite description reads cleanly. The short link's
      // expiry matches the underlying signed URL — once the signed URL
      // dies, the short link returns 410.
      try {
        const short = await createShortLink({
          url: signed.signedUrl,
          ttlSeconds: CV_SIGNED_URL_TTL_SECONDS,
          userId: user.id,
        });
        cvUrl = short.shortUrl;
      } catch (shortErr) {
        // Shortener failure isn't worth blocking the whole flow — fall
        // back to the long URL.
        console.error(
          "[interviews] short-link mint failed, falling back to long URL:",
          shortErr instanceof Error ? shortErr.message : shortErr,
        );
        cvUrl = signed.signedUrl;
      }
    }
  }

  // "Portfolio" maps to whichever candidate URL is most likely portfolio-y.
  // LinkedIn first (most common), then source_url as the next-best signal.
  const candidatePortfolioUrl =
    candidate.linkedin_url ?? candidate.source_url ?? null;

  // 1. Create the calendar event FIRST. If this fails, no DB row is created
  //    and the user can retry without seeing a half-saved interview. If it
  //    succeeds but the DB insert later fails, we'd have an orphan calendar
  //    event — manually deletable from the user's calendar. Acceptable
  //    trade-off for this scale.
  let calendarResult;
  try {
    calendarResult = await createInterviewEvent({
      userId: user.id,
      candidateName: candidate.full_name,
      candidateEmail: candidate.email,
      candidatePhone: candidate.phone,
      candidatePortfolioUrl,
      jdTitle,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      externalInvitees: body.externalInvitees,
      notes: body.description,
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
      { error: err instanceof Error ? err.message : "Calendar event failed" },
      { status: 502 },
    );
  }

  // 2. Insert the DB row, then audit it. interviews has no row_hash column
  //    (unlike candidates), so we just insert + audit cleanly.
  const { data: inserted, error: insErr } = await supabase
    .from("interviews")
    .insert({
      org_id: ORG_ID,
      candidate_id: body.candidateId,
      jd_id: body.jdId ?? null,
      stage: body.stage,
      status: "scheduled",
      starts_at: body.startsAt,
      ends_at: body.endsAt,
      google_event_id: calendarResult.eventId,
      google_calendar_id: calendarResult.calendarId,
      meet_url: calendarResult.meetUrl,
      description: calendarResult.description,
      organizer_id: user.id,
    })
    .select()
    .single();
  if (insErr || !inserted) {
    return NextResponse.json(
      {
        error:
          insErr?.message ??
          "Calendar event created but DB insert failed. Check Google Calendar manually.",
        eventId: calendarResult.eventId,
        meetUrl: calendarResult.meetUrl,
      },
      { status: 500 },
    );
  }

  try {
    await withAudit({
      actorId: user.id,
      orgId: ORG_ID,
      action: "insert",
      table: "interviews",
      targetId: inserted.id as string,
      before: null,
      mutate: async () => inserted,
    });
  } catch (auditErr) {
    // Audit failure shouldn't unwind a real-world side-effect (the Google
    // event already went out + the row is in the DB). Log + continue.
    console.error(
      "[interviews] audit insert failed:",
      auditErr instanceof Error ? auditErr.message : auditErr,
    );
  }

  return NextResponse.json({
    interviewId: inserted.id,
    meetUrl: calendarResult.meetUrl,
    eventId: calendarResult.eventId,
  });
}
