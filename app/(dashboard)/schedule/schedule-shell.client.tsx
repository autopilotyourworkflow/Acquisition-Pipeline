"use client";

import { useMemo, useState } from "react";
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
function defaultStart(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 30 - (d.getMinutes() % 15));
  d.setSeconds(0, 0);
  return toLocalInput(d);
}
function defaultEnd(start: string): string {
  const d = new Date(start);
  d.setMinutes(d.getMinutes() + 30);
  return toLocalInput(d);
}
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export function ScheduleShell({
  candidates,
}: {
  candidates: ScheduleCandidate[];
}) {
  const router = useRouter();

  const [candidateId, setCandidateId] = useState<string>(
    candidates[0]?.id ?? "",
  );
  const candidate = useMemo(
    () => candidates.find((c) => c.id === candidateId) ?? null,
    [candidates, candidateId],
  );

  const [stage, setStage] = useState<CandidateStage>("first_interview");
  const [startsAt, setStartsAt] = useState<string>(() => defaultStart());
  const [endsAt, setEndsAt] = useState<string>(() => defaultEnd(defaultStart()));
  const [externalInviteesText, setExternalInviteesText] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
    if (!startsAt || !endsAt) {
      toast.error("Pick start and end times");
      return;
    }
    const startISO = new Date(startsAt).toISOString();
    const endISO = new Date(endsAt).toISOString();
    if (new Date(endISO).getTime() <= new Date(startISO).getTime()) {
      toast.error("End time must be after start time");
      return;
    }

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
      // Reset light state but keep the candidate selection for back-to-back
      // bookings.
      setExternalInviteesText("");
      setNotes("");
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
          <Label className="text-xs text-slate-deep">Duration</Label>
          <p className="text-[11px] text-slate-mid">
            Pick start and end times below. Defaults to a 30-min slot starting
            ~30 minutes from now.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="starts" className="text-xs text-slate-deep">
            Starts
          </Label>
          <input
            id="starts"
            type="datetime-local"
            value={startsAt}
            onChange={(e) => {
              setStartsAt(e.target.value);
              setEndsAt(defaultEnd(e.target.value));
            }}
            className="h-9 w-full rounded-md border border-sand-200 bg-cream px-3 text-sm text-navy"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ends" className="text-xs text-slate-deep">
            Ends
          </Label>
          <input
            id="ends"
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="h-9 w-full rounded-md border border-sand-200 bg-cream px-3 text-sm text-navy"
          />
        </div>

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
            Prep questions from the latest score are auto-attached to the
            event description. These notes get appended.
          </p>
        </div>
      </div>

      {candidate && candidate.prep_questions.length > 0 && (
        <details className="rounded-md border border-sand-200 bg-warm-white">
          <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-navy">
            Prep questions that will be attached ({candidate.prep_questions.length})
          </summary>
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
