import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  createInterviewEvent,
  GoogleNotConnectedError,
} from "@/lib/google/calendar";
import { withAudit } from "@/lib/audit/wrap";
import { ORG_ID } from "@/lib/db/constants";
import { createShortLink } from "@/lib/short-links";
import { getCandidateCvInviteUrl } from "@/lib/interviews/cv-link";
import { advanceCandidateStageForInterview } from "@/lib/interviews/candidate-stage-sync";

// 30-day TTL on CV signed URLs. The interview lifecycle (schedule → meet →
// follow-up) typically completes inside a month, so the link stays valid
// through the full flow without needing to refresh. Trade-off: a leaked
// invite gives 30 days of CV access — acceptable given the recipient is
// already an invited attendee.
const CV_SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 30;
// Same TTL for the prep-page short link. The destination is auth-gated;
// short link expiry is just hygiene.
const PREP_LINK_TTL_SECONDS = 60 * 60 * 24 * 30;

function appBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL;
  if (fromEnv && fromEnv.trim()) return fromEnv.replace(/\/+$/, "");
  return "http://localhost:3000";
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Note: candidateId / jdId are validated as non-empty strings rather than
// strict UUIDs. Zod 4's `.uuid()` enforces full RFC-4122 v4 format (version
// + variant digit), which rejects perfectly valid Postgres-stored ids that
// happen to fall outside that bit pattern (e.g. demo seed rows). Since the
// ids round-trip from our own DB through RLS-scoped queries, format
// validation here adds no real safety — Postgres rejects malformed uuid
// casts at the column boundary anyway.
const Body = z.object({
  candidateId: z.string().min(1),
  jdId: z.string().min(1).nullable().optional(),
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

  // Pull the most recent CV attachment (if any) and mint a 30-day signed URL,
  // wrapped behind a short /l/<slug> link so the calendar invite description
  // reads cleanly. Centralized in lib/interviews/cv-link.ts so the reschedule
  // path can't accidentally diverge again.
  const cvUrl = await getCandidateCvInviteUrl({
    candidateId: body.candidateId,
    userId: user.id,
    ttlSeconds: CV_SIGNED_URL_TTL_SECONDS,
  });

  // "Portfolio" maps to whichever candidate URL is most likely portfolio-y.
  // LinkedIn first (most common), then source_url as the next-best signal.
  const candidatePortfolioUrl =
    candidate.linkedin_url ?? candidate.source_url ?? null;

  // Pre-generate the interview UUID so we can mint the staff-only prep
  // short link BEFORE creating the calendar event. That way the description
  // already includes the prep URL on the first calendar API call — no
  // second PATCH needed to backfill.
  const interviewId = crypto.randomUUID();
  let prepUrl: string | null = null;
  try {
    const prepDestination = `${appBaseUrl()}/interviews/${interviewId}/prep`;
    const shortLink = await createShortLink({
      url: prepDestination,
      ttlSeconds: PREP_LINK_TTL_SECONDS,
      userId: user.id,
    });
    prepUrl = shortLink.shortUrl;
  } catch (shortErr) {
    // Shortener failure shouldn't block scheduling — fall back to the long
    // URL directly. The prep page still works either way.
    console.error(
      "[interviews] prep short-link mint failed, using direct URL:",
      shortErr instanceof Error ? shortErr.message : shortErr,
    );
    prepUrl = `${appBaseUrl()}/interviews/${interviewId}/prep`;
  }

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
      { error: err instanceof Error ? err.message : "Calendar event failed" },
      { status: 502 },
    );
  }

  // 2. Insert the DB row, then audit it. interviews has no row_hash column
  //    (unlike candidates), so we just insert + audit cleanly.
  const { data: inserted, error: insErr } = await supabase
    .from("interviews")
    .insert({
      id: interviewId,
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

  // Auto-advance the candidate's tracker stage to match the interview that
  // was just scheduled (no-op if they're already at/past it, or terminal).
  // Best-effort: a failure here shouldn't unwind the Google event + DB row.
  try {
    await advanceCandidateStageForInterview({
      supabase,
      userId: user.id,
      candidateId: body.candidateId,
      interviewStage: body.stage,
    });
  } catch (stageErr) {
    console.error(
      "[interviews] candidate stage advance failed:",
      stageErr instanceof Error ? stageErr.message : stageErr,
    );
  }

  return NextResponse.json({
    interviewId: inserted.id,
    meetUrl: calendarResult.meetUrl,
    eventId: calendarResult.eventId,
  });
}
