import { google } from "googleapis";
import { getGoogleAccessToken } from "@/lib/google/oauth";

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
 * proposed interview window overlaps an existing busy block on their own
 * calendar. Multi-attendee FreeBusy (panelists, hiring manager) is Phase 5
 * — most external invitees won't share freebusy data with us anyway.
 *
 * Auth-degrade: if the user hasn't connected Google (email-OTP signin) or
 * has revoked the scope, this returns `{ conflicts: [] }` silently rather
 * than throwing. The form already surfaces a "connect Google" hint via the
 * existing booking flow — duplicating it here would be noise.
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

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: tokenResult.accessToken });
  const calendar = google.calendar({ version: "v3", auth });

  const proposedStartMs = new Date(args.startsAt).getTime();
  const proposedEndMs = new Date(args.endsAt).getTime();
  if (
    !Number.isFinite(proposedStartMs) ||
    !Number.isFinite(proposedEndMs) ||
    proposedEndMs <= proposedStartMs
  ) {
    return { conflicts: [] };
  }

  // freebusy.query returns busy intervals only — no event titles. We do a
  // second events.list call within the same window so the warning can show
  // *what's* in the way ("Standup" vs. just "10:00–10:30"). One extra HTTP
  // round-trip is fine at this cadence (debounced ~400ms, one per submit
  // attempt).
  let busy: Array<{ start?: string | null; end?: string | null }> = [];
  try {
    const fb = await calendar.freebusy.query({
      requestBody: {
        timeMin: args.startsAt,
        timeMax: args.endsAt,
        items: [{ id: "primary" }],
      },
    });
    busy = fb.data.calendars?.["primary"]?.busy ?? [];
  } catch {
    // If freebusy itself fails (rate-limited, transient), don't crash the
    // form — silently degrade to "no warning".
    return { conflicts: [] };
  }

  // Best-effort title resolution via events.list. Filter the events down
  // to the busy intervals that actually overlap the proposed window.
  let titledEvents: Array<{
    start?: string | null;
    end?: string | null;
    summary?: string | null;
  }> = [];
  try {
    const evs = await calendar.events.list({
      calendarId: "primary",
      timeMin: args.startsAt,
      timeMax: args.endsAt,
      singleEvents: true,
      // We only need a handful of overlapping events — keep the response
      // small. Default ordering is fine.
      maxResults: 25,
    });
    titledEvents = (evs.data.items ?? []).map((e) => ({
      start: e.start?.dateTime ?? e.start?.date ?? null,
      end: e.end?.dateTime ?? e.end?.date ?? null,
      summary: e.summary ?? null,
    }));
  } catch {
    // Title lookup is best-effort; we still want to return the busy
    // intervals from freebusy.
    titledEvents = [];
  }

  const conflicts: Array<{ start: string; end: string; summary?: string }> = [];
  for (const b of busy) {
    if (!b.start || !b.end) continue;
    const bStart = new Date(b.start).getTime();
    const bEnd = new Date(b.end).getTime();
    if (!Number.isFinite(bStart) || !Number.isFinite(bEnd)) continue;
    // Standard half-open overlap: A overlaps B iff A.start < B.end AND
    // A.end > B.start. Adjacent (end == start) is *not* a conflict.
    if (bStart < proposedEndMs && bEnd > proposedStartMs) {
      // Try to attach a title from titledEvents — match by start/end pair.
      const matched = titledEvents.find(
        (e) =>
          e.start &&
          e.end &&
          new Date(e.start).getTime() === bStart &&
          new Date(e.end).getTime() === bEnd,
      );
      conflicts.push({
        start: b.start,
        end: b.end,
        summary: matched?.summary ?? undefined,
      });
    }
  }

  return { conflicts };
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
