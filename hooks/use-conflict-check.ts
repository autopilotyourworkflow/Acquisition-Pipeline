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
 *   - Debounces 150ms after the inputs settle.
 *   - Stale-input protection: results are only returned when they match
 *     the current query (queryKey check). Eliminates flicker when the
 *     user changes inputs while a request is in flight.
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
}): { conflicts: Conflict[]; checking: boolean } {
  const isReady =
    enabled && Boolean(whenAt) && Number.isFinite(durationMin) && durationMin > 0;
  const currentKey = isReady ? `${whenAt}|${durationMin}` : "";

  // Single combined state — the queryKey field lets us derive "stale vs.
  // current" without any setState in the effect body. Updates only ever
  // happen in the fetch resolver (async callback) and the setTimeout
  // callback, which React's purity rule explicitly permits.
  const [result, setResult] = useState<{
    queryKey: string;
    conflicts: Conflict[];
    finished: boolean;
  }>({ queryKey: "", conflicts: [], finished: true });

  useEffect(() => {
    if (!isReady) return;

    const startDate = new Date(whenAt);
    const endDate = new Date(startDate.getTime() + durationMin * 60_000);
    const startISO = startDate.toISOString();
    const endISO = endDate.toISOString();

    const ctl = new AbortController();
    // 150ms debounce is a perceptual sweet spot: long enough to coalesce
    // bursts of keystrokes (datetime-local fires `change` on every minute
    // increment), short enough that single-click time picks feel instant.
    // The remaining latency (~300-500ms) is the Google API round trip we
    // can't shrink without pre-fetching the whole calendar window.
    const timer = setTimeout(async () => {
      try {
        const resp = await fetch("/api/schedule/conflicts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ startsAt: startISO, endsAt: endISO }),
          signal: ctl.signal,
        });
        if (!resp.ok) {
          if (!ctl.signal.aborted) {
            setResult({ queryKey: currentKey, conflicts: [], finished: true });
          }
          return;
        }
        const json = (await resp.json()) as { conflicts?: Conflict[] };
        if (!ctl.signal.aborted) {
          setResult({
            queryKey: currentKey,
            conflicts: json.conflicts ?? [],
            finished: true,
          });
        }
      } catch {
        // Aborted or transient — silent.
      }
    }, 150);

    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [currentKey, isReady, whenAt, durationMin]);

  // Derived: only surface conflicts when they match the current inputs.
  // While the key mismatches (inputs changed, fetch in flight), `checking`
  // is true and `conflicts` is empty — exactly the "loading new results"
  // state the UI wants.
  const conflicts =
    isReady && result.queryKey === currentKey ? result.conflicts : [];
  const checking = isReady && result.queryKey !== currentKey;

  return { conflicts, checking };
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
