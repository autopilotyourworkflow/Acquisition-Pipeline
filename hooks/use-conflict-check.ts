"use client";

import { useEffect, useState } from "react";

export type Conflict = { start: string; end: string; summary?: string };

/**
 * Shared FreeBusy/events.list-driven conflict check for any form that asks
 * the user to pick a time window. Used by the booking form (/schedule/new)
 * and both reschedule dialogs (calendar context-menu + InterviewActions).
 *
 * Inputs are intentionally the same primitives the forms already track:
 * `whenAt` as a "YYYY-MM-DDTHH:mm" datetime-local string interpreted in the
 * user's locale, plus `durationMin`. The hook derives ISO start/end and
 * POSTs them to `/api/schedule/conflicts`.
 *
 * Behaviour:
 *   - Debounces 400ms after the inputs settle.
 *   - Clears stale results immediately on any input change so a previous
 *     warning doesn't linger past the next keystroke.
 *   - AbortController cancels in-flight requests when inputs change again.
 *   - Soft-fails: any error → empty conflicts, no toast. The warning is
 *     informational; a network blip shouldn't surface to the user.
 *
 * Pass `enabled=false` when the parent form isn't ready to check (e.g.
 * the reschedule dialog is closed). Toggling enabled false → true
 * triggers a fresh check.
 */
export function useConflictCheck({
  whenAt,
  durationMin,
  enabled = true,
}: {
  whenAt: string;
  durationMin: number;
  enabled?: boolean;
}): { conflicts: Conflict[] } {
  const [conflicts, setConflicts] = useState<Conflict[]>([]);

  useEffect(() => {
    if (!enabled) {
      setConflicts([]);
      return;
    }
    if (!whenAt || !Number.isFinite(durationMin) || durationMin <= 0) {
      setConflicts([]);
      return;
    }
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
        const json = (await resp.json()) as { conflicts?: Conflict[] };
        setConflicts(json.conflicts ?? []);
      } catch {
        // Aborted or transient — silent.
      }
    }, 400);

    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [whenAt, durationMin, enabled]);

  return { conflicts };
}

/**
 * Format a busy interval into a short locale-friendly label.
 * "May 20 · 17:00–17:30" same-day or "May 20 17:00 → May 21 09:00" otherwise.
 */
export function formatConflictRange(startISO: string, endISO: string): string {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const opts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
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
