import { cn } from "@/lib/utils";
import type { InterviewStatus } from "@/lib/db/enums";

export type LatestInterview = {
  startsAt: string;
  status: InterviewStatus;
};

/**
 * Compact one-line indicator surfaced on Kanban cards + table rows after a
 * candidate has had an interview scheduled. Renders the latest interview's
 * date + status. Designed to fit in tight Kanban-card real estate without
 * dominating the card.
 *
 *   scheduled (future): "📅 Wed 20 Nov · 14:00"  black
 *   scheduled (past):   "📅 Wed 20 Nov · 14:00"  gray italic
 *   cancelled:          "✕ Cancelled · 20 Nov"   gray, strikethrough
 *   no_show:            "⚠ No-show · 20 Nov"     warning
 *   completed:          "✓ Done · 20 Nov"        gray
 *
 * Pass `compact` to drop the time portion (used in narrow table cells).
 */
export function InterviewIndicator({
  interview,
  compact = false,
  className,
}: {
  interview: LatestInterview;
  compact?: boolean;
  className?: string;
}) {
  const dt = new Date(interview.startsAt);
  const isPast = dt.getTime() < Date.now();

  const datePart = dt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Bangkok",
  });
  const timePart = dt.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  });

  const base = "inline-flex items-center gap-1 text-[10px] font-medium";

  if (interview.status === "cancelled") {
    return (
      <span
        className={cn(base, "text-gray line-through", className)}
        title={`Interview was cancelled · was ${datePart}`}
      >
        <span aria-hidden>✕</span> Cancelled · {datePart}
      </span>
    );
  }

  if (interview.status === "no_show") {
    return (
      <span
        className={cn(base, "text-warning", className)}
        title="Candidate didn't show up"
      >
        <span aria-hidden>⚠</span> No-show · {datePart}
      </span>
    );
  }

  if (interview.status === "completed") {
    return (
      <span className={cn(base, "text-gray", className)} title="Interview completed">
        <span aria-hidden>✓</span> Done · {datePart}
      </span>
    );
  }

  // scheduled / rescheduled — both render the same way; the underlying row's
  // PATCH handler stamps status back to 'scheduled' after a reschedule.
  return (
    <span
      className={cn(
        base,
        isPast ? "italic text-gray" : "text-black",
        className,
      )}
      title={isPast ? "Past interview — not yet marked completed" : "Upcoming interview"}
    >
      <span aria-hidden>📅</span> {datePart}
      {!compact && <> · {timePart}</>}
    </span>
  );
}
