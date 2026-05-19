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
  /** ISO 8601 with offset, e.g. "2026-05-19T14:30:00+07:00". */
  startsAt: string;
  endsAt: string;
  /**
   * Pulled from the candidate's latest score. Surfaced in the event
   * description so the interviewer has context inside their calendar
   * client without leaving it.
   */
  prepQuestions?: string[];
  /** Optional additional invitees by email (panelists, hiring manager, etc.). */
  externalInvitees?: string[];
  /** Free-form additional notes typed by the organizer. */
  notes?: string;
  /** Short label for the CV attachment, e.g. the original filename. */
  cvLabel?: string | null;
  /**
   * Signed URL to the candidate's most recent CV. Embedded in the calendar
   * event description so the interviewer can open it from inside the event.
   * Generated server-side from Supabase Storage with a 24h TTL.
   */
  cvUrl?: string | null;
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
    prepQuestions: args.prepQuestions ?? [],
    notes: args.notes,
    cvLabel: args.cvLabel,
    cvUrl: args.cvUrl,
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

function buildDescription({
  candidateName,
  prepQuestions,
  notes,
  cvLabel,
  cvUrl,
}: {
  candidateName: string;
  prepQuestions: string[];
  notes?: string;
  cvLabel?: string | null;
  cvUrl?: string | null;
}): string {
  const parts: string[] = [];
  parts.push(`Interview with ${candidateName}.`);

  if (prepQuestions.length > 0) {
    parts.push("");
    parts.push("— Prep questions —");
    for (const q of prepQuestions) {
      parts.push(`• ${q}`);
    }
  }

  if (cvUrl) {
    parts.push("");
    parts.push("— CV —");
    if (cvLabel) parts.push(cvLabel);
    parts.push(cvUrl);
    parts.push("(link valid for 24h)");
  }

  if (notes && notes.trim()) {
    parts.push("");
    parts.push("— Notes —");
    parts.push(notes.trim());
  }

  parts.push("");
  parts.push("—");
  parts.push("Acquisition Pipeline");
  return parts.join("\n");
}
