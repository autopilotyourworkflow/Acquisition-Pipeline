"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { CandidateStage } from "@/lib/db/enums";

export type ScheduleCandidate = {
  id: string;
  full_name: string;
  email: string | null;
  current_title: string | null;
  stage: CandidateStage;
  jd_id: string | null;
  prep_questions: string[];
};

const STAGE_CHOICES: { value: CandidateStage; label: string }[] = [
  { value: "prescreen_call", label: "Pre-screen call" },
  { value: "first_interview", label: "First interview" },
  { value: "screening", label: "Screening" },
  { value: "offer", label: "Offer conversation" },
];

/**
 * Default datetime helpers. `<input type="datetime-local">` produces strings
 * without timezone (e.g. "2026-05-19T15:30"). new Date(localString) parses
 * those as local time, so .toISOString() gives us a correctly-tz-anchored
 * ISO 8601 with offset that the Google Calendar API accepts directly.
 */
function defaultWhen(): string {
  const d = new Date();
  // Snap to the next 15-minute mark, then push another 30 min out so the
  // default isn't "right now" (which always feels rushed).
  d.setMinutes(d.getMinutes() + 30);
  d.setMinutes(d.getMinutes() + ((15 - (d.getMinutes() % 15)) % 15));
  d.setSeconds(0, 0);
  return toLocalInput(d);
}
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/**
 * Format a busy interval into the user's locale time. Both endpoints come
 * from Google as ISO strings with offsets; `Date` parses them correctly,
 * `toLocaleTimeString` renders in the browser's timezone — which for HR in
 * Bangkok is the right thing.
 */
function formatBusyRange(startISO: string, endISO: string): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const opts: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
  };
  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate();
  const dateLabel = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const startLabel = start.toLocaleTimeString(undefined, opts);
  const endLabel = end.toLocaleTimeString(undefined, opts);
  return sameDay
    ? `${dateLabel} · ${startLabel}–${endLabel}`
    : `${dateLabel} ${startLabel} → ${end.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })} ${endLabel}`;
}

const DURATION_OPTIONS: { value: number; label: string }[] = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1 hour" },
  { value: 75, label: "1h 15m" },
  { value: 90, label: "1h 30m" },
  { value: 105, label: "1h 45m" },
  { value: 120, label: "2 hours" },
  { value: 150, label: "2h 30m" },
  { value: 180, label: "3 hours" },
];

export function ScheduleShell({
  candidates,
  initialCandidateId,
}: {
  candidates: ScheduleCandidate[];
  initialCandidateId?: string | null;
}) {
  const router = useRouter();

  const [candidateId, setCandidateId] = useState<string>(
    initialCandidateId ?? candidates[0]?.id ?? "",
  );
  const candidate = useMemo(
    () => candidates.find((c) => c.id === candidateId) ?? null,
    [candidates, candidateId],
  );

  const [stage, setStage] = useState<CandidateStage>("first_interview");
  const [whenAt, setWhenAt] = useState<string>(() => defaultWhen());
  const [durationMin, setDurationMin] = useState<number>(30);
  const [externalInviteesText, setExternalInviteesText] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Warn-only conflict detection. Fires ~400ms after the user stops changing
  // either time field. Read-only check against the booker's primary calendar
  // via /api/schedule/conflicts (which auth-degrades silently if Google
  // isn't connected, so we don't need to special-case the OTP-only user).
  // Submit stays enabled — HR may legitimately want to double-book over a
  // buffer block.
  const [conflicts, setConflicts] = useState<
    Array<{ start: string; end: string; summary?: string }>
  >([]);
  useEffect(() => {
    if (!whenAt || !Number.isFinite(durationMin) || durationMin <= 0) {
      setConflicts([]);
      return;
    }
    // Hide stale results immediately on any change. The debounce-tick will
    // repopulate once the user settles.
    setConflicts([]);

    const startDate = new Date(whenAt);
    const endDate = new Date(startDate.getTime() + durationMin * 60_000);
    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();

    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const resp = await fetch("/api/schedule/conflicts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ startsAt: startISO, endsAt: endISO }),
          signal: ctl.signal,
        });
        if (!resp.ok) {
          setConflicts([]);
          return;
        }
        const json = (await resp.json()) as {
          conflicts?: Array<{ start: string; end: string; summary?: string }>;
        };
        setConflicts(json.conflicts ?? []);
      } catch {
        // Aborted by a later edit, or network blip — drop silently.
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [whenAt, durationMin]);

  if (candidates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-sand-200 bg-cream/40 p-10 text-center">
        <p className="font-display text-xl text-navy">No candidates yet</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-charcoal">
          Add a candidate from the Tracker or Scraper before scheduling
          interviews.
        </p>
      </div>
    );
  }

  const externalInvitees = externalInviteesText
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!candidate) {
      toast.error("Pick a candidate");
      return;
    }
    if (!whenAt) {
      toast.error("Pick a date and time");
      return;
    }
    if (!Number.isFinite(durationMin) || durationMin <= 0) {
      toast.error("Pick a duration");
      return;
    }
    const startDate = new Date(whenAt);
    const endDate = new Date(startDate.getTime() + durationMin * 60_000);
    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();

    setSubmitting(true);
    try {
      const resp = await fetch("/api/interviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          candidateId: candidate.id,
          jdId: candidate.jd_id,
          stage,
          startsAt: startISO,
          endsAt: endISO,
          description: notes || undefined,
          externalInvitees:
            externalInvitees.length > 0 ? externalInvitees : undefined,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (resp.status === 409) {
          toast.error("Google not connected", {
            description: json?.error ?? "Reconnect from Settings → Integrations.",
          });
        } else {
          toast.error("Couldn't schedule", {
            description: json?.error ?? `HTTP ${resp.status}`,
          });
        }
        return;
      }
      toast.success("Interview scheduled", {
        description: json.meetUrl
          ? `Meet link: ${json.meetUrl}`
          : "Calendar invite sent.",
      });
      setExternalInviteesText("");
      setNotes("");
      // Navigate back to the overview so the new event shows up in the list /
      // calendar without the user having to click around.
      router.push("/schedule");
      router.refresh();
    } catch (err) {
      toast.error("Network error", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="grid gap-4 rounded-lg border border-sand-200 bg-warm-white p-5 md:grid-cols-2">
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="candidate" className="text-xs text-slate-deep">
            Candidate
          </Label>
          <select
            id="candidate"
            value={candidateId}
            onChange={(e) => setCandidateId(e.target.value)}
            className="h-9 w-full rounded-md border border-sand-200 bg-cream px-3 text-sm text-navy"
          >
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
                {c.current_title ? ` — ${c.current_title}` : ""}
                {c.email ? ` · ${c.email}` : " · (no email on file)"}
              </option>
            ))}
          </select>
          {candidate && !candidate.email && (
            <p className="text-[11px] text-warning">
              No email on file — the candidate won&apos;t receive an invite.
              Add their email on the Tracker first if they should.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="stage" className="text-xs text-slate-deep">
            Stage
          </Label>
          <select
            id="stage"
            value={stage}
            onChange={(e) => setStage(e.target.value as CandidateStage)}
            className="h-9 w-full rounded-md border border-sand-200 bg-cream px-3 text-sm text-navy"
          >
            {STAGE_CHOICES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="when" className="text-xs text-slate-deep">
            Date &amp; time
          </Label>
          <input
            id="when"
            type="datetime-local"
            step={900}
            value={whenAt}
            onChange={(e) => setWhenAt(e.target.value)}
            className="h-9 w-full rounded-md border border-sand-200 bg-cream px-3 text-sm text-navy"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="duration" className="text-xs text-slate-deep">
            Duration
          </Label>
          <select
            id="duration"
            value={durationMin}
            onChange={(e) => setDurationMin(Number(e.target.value))}
            className="h-9 w-full rounded-md border border-sand-200 bg-cream px-3 text-sm text-navy"
          >
            {DURATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-mid">
            Defaults to 30 min, starting from the next 15-min mark ~30 min
            from now.
          </p>
        </div>

        {conflicts.length > 0 && (
          <div
            className="md:col-span-2 rounded-md border border-terracotta/40 bg-terracotta/10 px-4 py-3"
            role="status"
            aria-live="polite"
          >
            <p className="text-sm font-medium text-terracotta">
              ⚠ Conflict on your calendar
            </p>
            <ul className="mt-1.5 space-y-0.5 text-xs text-charcoal">
              {conflicts.map((c, i) => (
                <li key={`${c.start}-${c.end}-${i}`}>
                  {c.summary ? `${c.summary} — ` : ""}
                  {formatBusyRange(c.start, c.end)}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-slate-mid">
              You can still book over this — Hotel Plus calendars often hold
              buffer blocks that are fine to overlap.
            </p>
          </div>
        )}

        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="invitees" className="text-xs text-slate-deep">
            Additional invitees (optional)
          </Label>
          <input
            id="invitees"
            type="text"
            value={externalInviteesText}
            onChange={(e) => setExternalInviteesText(e.target.value)}
            placeholder="hiring.manager@hotelplus.asia, panelist@hotelplus.asia"
            className="h-9 w-full rounded-md border border-sand-200 bg-cream px-3 text-sm text-navy"
          />
          <p className="text-[11px] text-slate-mid">
            Comma-separated emails. All attendees (candidate + invitees) get the
            invite via Google Calendar.
          </p>
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="notes" className="text-xs text-slate-deep">
            Extra notes (optional)
          </Label>
          <textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Logistics, panel agenda, anything else…"
            rows={2}
            className="w-full rounded-md border border-sand-200 bg-cream px-3 py-2 text-sm text-navy"
          />
          <p className="text-[11px] text-slate-mid">
            Appended to the candidate-facing description after the standard
            Hotel Plus invitation template.
          </p>
        </div>
      </div>

      {candidate && candidate.prep_questions.length > 0 && (
        <details className="rounded-md border border-sand-200 bg-warm-white">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-navy">
            Prep questions ({candidate.prep_questions.length}) — interviewer-only,
            not sent to candidate
          </summary>
          <div className="border-t border-sand-100 px-4 py-3 text-[11px] text-slate-mid">
            Review these before the meeting. They live on the candidate detail
            page and are NOT included in the calendar invite the candidate
            receives.
          </div>
          <ul className="list-disc space-y-1 border-t border-sand-100 px-8 py-3 text-sm text-charcoal marker:text-terracotta">
            {candidate.prep_questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting || !candidate}>
          {submitting ? "Sending invite…" : "Schedule interview"}
        </Button>
      </div>
    </form>
  );
}
