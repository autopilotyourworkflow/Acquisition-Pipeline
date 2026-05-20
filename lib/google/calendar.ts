import { google } from "googleapis";
import { getGoogleAccessToken } from "@/lib/google/oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAudit } from "@/lib/audit/wrap";
import { ORG_ID } from "@/lib/db/constants";

/**
 * Thin wrapper around Google Calendar's events.insert.
 *
 * Phase-3c scope: single-attendee interviews from our user → the candidate
 * (plus any external invitees the user types in). Multi-party FreeBusy and
 * scheduling-link flows are Phase-4 work.
 */

export type CreateInterviewArgs = {
  /** The Supabase user.id of whoever's organizing — used to fetch their access token. */
  userId: string;
  candidateName: string;
  candidateEmail?: string | null;
  candidatePhone?: string | null;
  /** Candidate's portfolio / LinkedIn URL — surfaced in the invite. */
  candidatePortfolioUrl?: string | null;
  /** Title of the JD this interview is for. Surfaced as "Position" in the invite. */
  jdTitle?: string | null;
  /** ISO 8601 with offset, e.g. "2026-05-19T14:30:00+07:00". */
  startsAt: string;
  endsAt: string;
  /** Optional additional invitees by email (panelists, hiring manager, etc.). */
  externalInvitees?: string[];
  /** Free-form additional notes typed by the organizer. */
  notes?: string;
  /**
   * Signed URL to the candidate's most recent CV. Embedded in the calendar
   * event description so the candidate (and any invitees) can open it. The
   * URL has a long TTL (~30 days) so the link remains valid through the
   * normal interview lifecycle.
   */
  cvUrl?: string | null;
  /**
   * URL to the staff-only interview-prep page (with prep questions + score
   * summary). Goes into the calendar description but the destination is
   * org-auth-gated, so candidates can't actually open it.
   */
  prepUrl?: string | null;
};

export type CreateInterviewResult = {
  eventId: string;
  calendarId: string;
  meetUrl: string | null;
  description: string;
};

/**
 * Thrown when the organizing user hasn't connected Google (email-OTP signin)
 * or has revoked the scope. Callers should map this to a friendly UI state
 * instead of a generic 500.
 */
export class GoogleNotConnectedError extends Error {
  constructor(
    public reason: "not_connected" | "revoked",
    public detail?: string,
  ) {
    super(
      reason === "not_connected"
        ? "User has not connected a Google account."
        : "Google access has been revoked.",
    );
    this.name = "GoogleNotConnectedError";
  }
}

export async function createInterviewEvent(
  args: CreateInterviewArgs,
): Promise<CreateInterviewResult> {
  const tokenResult = await getGoogleAccessToken(args.userId);
  if (!tokenResult.ok) {
    if (
      tokenResult.reason === "not_connected" ||
      tokenResult.reason === "revoked"
    ) {
      throw new GoogleNotConnectedError(
        tokenResult.reason,
        tokenResult.message,
      );
    }
    throw new Error(
      `Failed to obtain Google access token: ${tokenResult.message ?? tokenResult.reason}`,
    );
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: tokenResult.accessToken });
  const calendar = google.calendar({ version: "v3", auth });

  const description = buildDescription({
    candidateName: args.candidateName,
    candidateEmail: args.candidateEmail,
    candidatePhone: args.candidatePhone,
    candidatePortfolioUrl: args.candidatePortfolioUrl,
    jdTitle: args.jdTitle,
    notes: args.notes,
    cvUrl: args.cvUrl,
    prepUrl: args.prepUrl,
  });

  const attendees: { email: string }[] = [];
  if (args.candidateEmail && args.candidateEmail.trim()) {
    attendees.push({ email: args.candidateEmail.trim() });
  }
  for (const email of args.externalInvitees ?? []) {
    if (email && email.trim()) attendees.push({ email: email.trim() });
  }

  // Unique requestId per event — Google uses this to de-dupe Meet creation if
  // the call retries. Random + timestamp is more than enough for our scale.
  const requestId = `acq-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const response = await calendar.events.insert({
    calendarId: "primary",
    sendUpdates: "all",
    conferenceDataVersion: 1,
    requestBody: {
      summary: `Interview: ${args.candidateName}`,
      description,
      start: { dateTime: args.startsAt },
      end: { dateTime: args.endsAt },
      attendees: attendees.length > 0 ? attendees : undefined,
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    },
  });

  const eventId = response.data.id;
  if (!eventId) {
    throw new Error("Calendar event created but no event ID returned");
  }

  return {
    eventId,
    calendarId: "primary",
    meetUrl: response.data.hangoutLink ?? null,
    description,
  };
}

/**
 * Hotel Plus interview-invitation template — the candidate sees this text in
 * their Google Calendar invite, so it's written for them. Internal-only
 * info like prep questions does NOT go here (those live on the candidate
 * detail page for the interviewer to review pre-meeting).
 *
 * Google Calendar's API treats `description` as HTML in the web UI — `<b>`
 * for emphasis, `<br>` for line breaks. Mobile clients that strip tags
 * still render the text legibly, just without the bolding.
 */
/**
 * Cancel a previously-created Google Calendar event. Sends cancellation
 * notifications to all attendees so they get the standard "Event canceled"
 * email. No-op if the event doesn't exist on Google's side — we treat 404
 * as success because the user's intent (it shouldn't be on the calendar)
 * is satisfied either way.
 */
export async function cancelInterviewEvent(args: {
  userId: string;
  eventId: string;
  calendarId?: string;
}): Promise<void> {
  const tokenResult = await getGoogleAccessToken(args.userId);
  if (!tokenResult.ok) {
    if (
      tokenResult.reason === "not_connected" ||
      tokenResult.reason === "revoked"
    ) {
      throw new GoogleNotConnectedError(
        tokenResult.reason,
        tokenResult.message,
      );
    }
    throw new Error(
      `Failed to obtain Google access token: ${tokenResult.message ?? tokenResult.reason}`,
    );
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: tokenResult.accessToken });
  const calendar = google.calendar({ version: "v3", auth });

  try {
    await calendar.events.delete({
      calendarId: args.calendarId ?? "primary",
      eventId: args.eventId,
      sendUpdates: "all",
    });
  } catch (err: unknown) {
    const status =
      (err as { code?: number; status?: number })?.code ??
      (err as { code?: number; status?: number })?.status;
    if (status === 404 || status === 410) {
      // Already gone — treat as success.
      return;
    }
    throw err;
  }
}

/**
 * Reschedule an existing interview event. Only changes start/end and the
 * description (in case prep questions or notes shifted). Attendees stay
 * the same and Google sends an "Event updated" notification to all of them.
 */
export async function rescheduleInterviewEvent(args: {
  userId: string;
  eventId: string;
  calendarId?: string;
  startsAt: string;
  endsAt: string;
  candidateName: string;
  candidateEmail?: string | null;
  candidatePhone?: string | null;
  candidatePortfolioUrl?: string | null;
  jdTitle?: string | null;
  notes?: string;
  cvUrl?: string | null;
  prepUrl?: string | null;
}): Promise<{ description: string; meetUrl: string | null }> {
  const tokenResult = await getGoogleAccessToken(args.userId);
  if (!tokenResult.ok) {
    if (
      tokenResult.reason === "not_connected" ||
      tokenResult.reason === "revoked"
    ) {
      throw new GoogleNotConnectedError(
        tokenResult.reason,
        tokenResult.message,
      );
    }
    throw new Error(
      `Failed to obtain Google access token: ${tokenResult.message ?? tokenResult.reason}`,
    );
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: tokenResult.accessToken });
  const calendar = google.calendar({ version: "v3", auth });

  const description = buildDescription({
    candidateName: args.candidateName,
    candidateEmail: args.candidateEmail,
    candidatePhone: args.candidatePhone,
    candidatePortfolioUrl: args.candidatePortfolioUrl,
    jdTitle: args.jdTitle,
    notes: args.notes,
    cvUrl: args.cvUrl,
    prepUrl: args.prepUrl,
  });

  const response = await calendar.events.patch({
    calendarId: args.calendarId ?? "primary",
    eventId: args.eventId,
    sendUpdates: "all",
    requestBody: {
      start: { dateTime: args.startsAt },
      end: { dateTime: args.endsAt },
      description,
    },
  });

  return {
    description,
    meetUrl: response.data.hangoutLink ?? null,
  };
}

/**
 * Read-only conflict check against the booker's primary calendar.
 *
 * Used by `/api/schedule/conflicts` to warn (not block) the user when the
 * proposed interview window overlaps an existing event on their own
 * calendar. Multi-attendee FreeBusy (panelists, hiring manager) is Phase 5
 * — most external invitees won't share freebusy data with us anyway.
 *
 * Implementation note: we use `events.list` directly rather than
 * `freebusy.query`. FreeBusy clips its returned intervals to the query
 * window, which made title matching impossible when the user's proposed
 * time wasn't an exact start/end match for an existing event (e.g.,
 * proposing 17:10–17:40 when "Standup" runs 17:00–17:30). events.list
 * returns full event objects with titles — one HTTP call instead of two,
 * and overlap detection is straightforward.
 *
 * Auth-degrade: if the user hasn't connected Google (email-OTP signin) or
 * has revoked the scope, this returns `{ conflicts: [] }` silently rather
 * than throwing. The form already surfaces a "connect Google" hint via the
 * existing booking flow — duplicating it here would be noise.
 *
 * Tentative / declined events: events.list returns events the user organized
 * AND events they were invited to. We DON'T filter out declined events —
 * if it's on their calendar showing as busy, the user probably wants to
 * see the warning. They can ignore it; we don't decide for them.
 */
export async function checkBusy(args: {
  userId: string;
  startsAt: string;
  endsAt: string;
}): Promise<{
  conflicts: Array<{ start: string; end: string; summary?: string }>;
}> {
  const tokenResult = await getGoogleAccessToken(args.userId);
  if (!tokenResult.ok) {
    return { conflicts: [] };
  }

  const proposedStartMs = new Date(args.startsAt).getTime();
  const proposedEndMs = new Date(args.endsAt).getTime();
  if (
    !Number.isFinite(proposedStartMs) ||
    !Number.isFinite(proposedEndMs) ||
    proposedEndMs <= proposedStartMs
  ) {
    return { conflicts: [] };
  }

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: tokenResult.accessToken });
  const calendar = google.calendar({ version: "v3", auth });

  // Widen the query window slightly so events that START before the proposed
  // window but END inside it (or start inside and end after) are still
  // returned. events.list uses `timeMin <= event.end` and `timeMax >= event.start`
  // semantics, so passing exactly the proposed window already handles this
  // correctly — but we keep the window tight so the response stays small.
  let items: Array<{
    start?: string | null;
    end?: string | null;
    summary?: string | null;
    status?: string | null;
  }> = [];
  try {
    const evs = await calendar.events.list({
      calendarId: "primary",
      timeMin: args.startsAt,
      timeMax: args.endsAt,
      singleEvents: true,
      // Up to 25 overlapping events is more than any human schedule will hit
      // in a sub-2-hour window. Bounds the response.
      maxResults: 25,
    });
    items = (evs.data.items ?? []).map((e) => ({
      start: e.start?.dateTime ?? e.start?.date ?? null,
      end: e.end?.dateTime ?? e.end?.date ?? null,
      summary: e.summary ?? null,
      status: e.status ?? null,
    }));
  } catch {
    // Soft fail — the form treats this as "no warning" so a transient
    // calendar API blip doesn't block the user from submitting.
    return { conflicts: [] };
  }

  const conflicts: Array<{ start: string; end: string; summary?: string }> = [];
  for (const ev of items) {
    if (!ev.start || !ev.end) continue;
    // Skip explicitly cancelled events — Google sometimes still returns them
    // with singleEvents=true.
    if (ev.status === "cancelled") continue;
    const eStart = new Date(ev.start).getTime();
    const eEnd = new Date(ev.end).getTime();
    if (!Number.isFinite(eStart) || !Number.isFinite(eEnd)) continue;
    // Half-open overlap: A overlaps B iff A.start < B.end AND A.end > B.start.
    // Adjacent (end == start) is NOT a conflict.
    if (eStart < proposedEndMs && eEnd > proposedStartMs) {
      conflicts.push({
        start: ev.start,
        end: ev.end,
        summary: ev.summary ?? undefined,
      });
    }
  }

  return { conflicts };
}

/**
 * One-way sync from Google Calendar → our DB. The other direction (our DB
 * → Google) is already covered by the create / reschedule / cancel routes
 * (which all call Google with `sendUpdates='all'`). This closes the loop
 * for the case where HR deletes or modifies an event directly in Google
 * Calendar — without this, the web app would keep showing the interview as
 * scheduled forever.
 *
 * Strategy (one HTTP call, bounded N):
 *   1. Read all our DB rows where status='scheduled', starts_at > now,
 *      and we have a google_event_id (= the interview is on Google).
 *   2. Fetch all *current* (non-cancelled, non-deleted) events from the
 *      user's primary calendar between now and +90 days via a single
 *      `events.list` call. Build a Set of event IDs we saw.
 *   3. For each DB row whose google_event_id is NOT in that set, mark the
 *      row as `cancelled` (going through withAudit so it appears in the
 *      activity log + remains undo-able).
 *
 * Auth-degrade: bails silently if the user signed in via email-OTP and
 * never connected Google. Their DB rows are then the source of truth and
 * we have nothing to reconcile against — no error, no toast.
 *
 * Performance: page-load latency adds one Google API round-trip, ~150-400ms
 * round trip from Vercel SG → Google. For 10 scheduled interviews it's a
 * fixed cost; for 100, still one call. The DB writes per stale row are
 * small (≤5 in any realistic case).
 *
 * Out of scope (yet): syncing time/title changes from Google. We only
 * detect deletes here — covers the "I deleted it from my Google app and
 * the web still shows it" demo case, which is what HR will actually do.
 */
export async function reconcileWithGoogle(args: {
  userId: string;
}): Promise<{ cancelled: number; checked: number }> {
  const tokenResult = await getGoogleAccessToken(args.userId);
  if (!tokenResult.ok) {
    return { cancelled: 0, checked: 0 };
  }

  const admin = createAdminClient();

  // Pull our side first. Only rows that should still be live on Google —
  // no point checking already-cancelled ones, and no point checking past
  // interviews (HR can't "delete" something that already happened in any
  // meaningful sense).
  const nowIso = new Date().toISOString();
  const { data: rows, error: rowsErr } = await admin
    .from("interviews")
    .select("id, google_event_id, organizer_id, starts_at")
    .eq("organizer_id", args.userId)
    .eq("status", "scheduled")
    .gte("starts_at", nowIso)
    .not("google_event_id", "is", null);
  if (rowsErr || !rows || rows.length === 0) {
    return { cancelled: 0, checked: 0 };
  }

  // One events.list call covering the next 90 days. 90 days is generous —
  // interview cycles rarely stretch past a month, and capping `maxResults`
  // bounds the response anyway.
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 90);

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: tokenResult.accessToken });
  const calendar = google.calendar({ version: "v3", auth });

  const liveIds = new Set<string>();
  try {
    const evs = await calendar.events.list({
      calendarId: "primary",
      timeMin: nowIso,
      timeMax: horizon.toISOString(),
      singleEvents: true,
      maxResults: 250,
      showDeleted: false,
    });
    // Safety bail: if Google indicates there are more pages we didn't fetch,
    // we can't be sure a DB row missing from `liveIds` is actually deleted
    // (it might just be on page 2). Marking anything cancelled in that
    // state risks false positives — better to skip this reconciliation and
    // try again next page load. At take-home scale (≤250 events in 90 days)
    // this branch is unreachable, but it future-proofs against a busy
    // calendar.
    if (evs.data.nextPageToken) {
      console.warn(
        "[calendar.reconcile] >250 events in 90-day window, skipping to avoid false cancellations",
      );
      return { cancelled: 0, checked: rows.length };
    }
    for (const e of evs.data.items ?? []) {
      if (e.id && e.status !== "cancelled") liveIds.add(e.id);
    }
  } catch (err) {
    // If Google itself fails (rate-limited, transient), don't mark our
    // rows as deleted — that would be data loss. Bail.
    console.error(
      "[calendar.reconcile] events.list failed, skipping reconciliation:",
      err instanceof Error ? err.message : err,
    );
    return { cancelled: 0, checked: 0 };
  }

  let cancelled = 0;
  for (const row of rows) {
    const eventId = row.google_event_id as string | null;
    if (!eventId) continue;
    if (liveIds.has(eventId)) continue;

    // The event is in our DB but no longer on Google → HR deleted it
    // directly. Mirror that to our DB.
    try {
      // Re-fetch the full row so withAudit's `before` snapshot matches the
      // current state of the world.
      const { data: before } = await admin
        .from("interviews")
        .select("*")
        .eq("id", row.id as string)
        .single();
      await withAudit({
        actorId: args.userId,
        orgId: ORG_ID,
        action: "update",
        table: "interviews",
        targetId: row.id as string,
        before: before ?? null,
        mutate: async () => {
          const { data, error } = await admin
            .from("interviews")
            .update({ status: "cancelled" })
            .eq("id", row.id as string)
            .select()
            .single();
          if (error) throw error;
          return data;
        },
      });
      cancelled++;
    } catch (err) {
      console.error(
        "[calendar.reconcile] failed to mark row cancelled:",
        row.id,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { cancelled, checked: rows.length };
}

function buildDescription({
  candidateName,
  candidateEmail,
  candidatePhone,
  candidatePortfolioUrl,
  jdTitle,
  notes,
  cvUrl,
  prepUrl,
}: {
  candidateName: string;
  candidateEmail?: string | null;
  candidatePhone?: string | null;
  candidatePortfolioUrl?: string | null;
  jdTitle?: string | null;
  notes?: string;
  cvUrl?: string | null;
  prepUrl?: string | null;
}): string {
  const lines: string[] = [];

  lines.push("<b>Hotel Plus – Interview Invitation</b>");
  if (jdTitle && jdTitle.trim()) {
    lines.push(`Position: ${jdTitle.trim()}`);
  }

  // Candidate block — only emit fields that actually have a value, so the
  // invite doesn't read like "Phone: —" on every line we don't have data
  // for.
  lines.push("");
  lines.push(`Candidate: ${candidateName}`);
  if (candidatePhone && candidatePhone.trim()) {
    lines.push(`Phone: ${candidatePhone.trim()}`);
  }
  if (candidateEmail && candidateEmail.trim()) {
    lines.push(`E-mail: ${candidateEmail.trim()}`);
  }
  if (cvUrl) {
    lines.push(`CV: ${cvUrl}`);
  }
  if (candidatePortfolioUrl && candidatePortfolioUrl.trim()) {
    lines.push(`Portfolio: ${candidatePortfolioUrl.trim()}`);
  }

  lines.push("");
  lines.push("<b>Interviewer:</b>");
  lines.push("Hotel Plus Recruitment Team / Automation Team");
  lines.push("");
  lines.push(
    "Should you require any additional information or wish to reschedule the interview date or time, please feel free to contact me at 082-226-1181",
  );

  if (notes && notes.trim()) {
    lines.push("");
    lines.push("—");
    lines.push(notes.trim());
  }

  // Staff-only prep link. The URL is auth-gated at the destination, so the
  // candidate can see the line but won't be able to open the contents.
  // Label it explicitly as internal so the candidate doesn't try.
  if (prepUrl) {
    lines.push("");
    lines.push("— Internal use only (staff) —");
    lines.push(`Interview prep &amp; score brief: ${prepUrl}`);
  }

  return lines.join("\n");
}
