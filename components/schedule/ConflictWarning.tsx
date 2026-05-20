import { formatConflictRange, type Conflict } from "@/hooks/use-conflict-check";

/**
 * Shared inline warning rendered under time pickers when the proposed
 * interview window overlaps an existing event on the booker's calendar.
 *
 * Returns null only when neither `conflicts` nor `checking` is truthy, so
 * callers can drop it in without a guard. While `checking` is true, shows
 * a low-key "Checking your calendar…" line — gives the user immediate
 * feedback during the ~300-500ms Google API round-trip.
 *
 * Visual: terracotta-tinted card. Brand-aligned with the warning surfaces
 * already used elsewhere (scoring failures, integration errors).
 */
export function ConflictWarning({
  conflicts,
  checking = false,
  className,
}: {
  conflicts: Conflict[];
  checking?: boolean;
  className?: string;
}) {
  if (conflicts.length === 0 && !checking) return null;
  if (conflicts.length === 0 && checking) {
    return (
      <p
        className={`text-[11px] text-slate-mid ${className ?? ""}`}
        role="status"
        aria-live="polite"
      >
        Checking your calendar…
      </p>
    );
  }
  return (
    <div
      className={`rounded-md border border-terracotta/40 bg-terracotta/10 px-4 py-3 ${className ?? ""}`}
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
            {formatConflictRange(c.start, c.end)}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-slate-mid">
        You can still book over this — Hotel Plus calendars often hold buffer
        blocks that are fine to overlap.
      </p>
    </div>
  );
}
