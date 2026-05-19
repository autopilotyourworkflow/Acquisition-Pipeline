"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ScheduleXCalendar, useNextCalendarApp } from "@schedule-x/react";
import {
  createViewDay,
  createViewMonthAgenda,
  createViewMonthGrid,
  createViewWeek,
} from "@schedule-x/calendar";
import { createEventsServicePlugin } from "@schedule-x/events-service";
import "@schedule-x/theme-default/dist/index.css";
import "./calendar-theme.css";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InterviewActions } from "@/components/interviews/InterviewActions.client";
import { cn } from "@/lib/utils";

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

function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export type OverviewInterview = {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string | null;
  jdTitle: string | null;
  stage: string;
  status: "scheduled" | "rescheduled" | "completed" | "cancelled" | "no_show";
  /** ISO 8601 with offset. */
  startsAt: string;
  endsAt: string;
  meetUrl: string | null;
};

const STAGE_LABELS: Record<string, string> = {
  applied: "Applied",
  screening: "Screening",
  prescreen_call: "Pre-screen call",
  first_interview: "First interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Rejected",
};

/**
 * Schedule-X wants date strings as "YYYY-MM-DD HH:mm" interpreted in the
 * USER's local timezone (no offset suffix, no "T"). Our DB sends ISO 8601
 * with offset, so we format Date locally.
 */
function toScheduleXLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

const CALENDAR_CATEGORIES = {
  scheduled: {
    colorName: "scheduled",
    lightColors: {
      main: "#16a34a", // success green
      container: "#dcfce7",
      onContainer: "#14532d",
    },
    darkColors: {
      main: "#16a34a",
      onContainer: "#dcfce7",
      container: "#14532d",
    },
  },
  rescheduled: {
    colorName: "rescheduled",
    lightColors: {
      main: "#0284c7", // info sky blue
      container: "#e0f2fe",
      onContainer: "#0c4a6e",
    },
    darkColors: {
      main: "#0284c7",
      onContainer: "#e0f2fe",
      container: "#0c4a6e",
    },
  },
  completed: {
    colorName: "completed",
    lightColors: {
      main: "#64748b", // slate
      container: "#e2e8f0",
      onContainer: "#1e293b",
    },
    darkColors: {
      main: "#64748b",
      onContainer: "#e2e8f0",
      container: "#1e293b",
    },
  },
  cancelled: {
    colorName: "cancelled",
    lightColors: {
      main: "#d97706", // warning amber
      container: "#fef3c7",
      onContainer: "#78350f",
    },
    darkColors: {
      main: "#d97706",
      onContainer: "#fef3c7",
      container: "#78350f",
    },
  },
  no_show: {
    colorName: "no_show",
    lightColors: {
      main: "#dc2626", // danger red
      container: "#fee2e2",
      onContainer: "#7f1d1d",
    },
    darkColors: {
      main: "#dc2626",
      onContainer: "#fee2e2",
      container: "#7f1d1d",
    },
  },
} as const;

export function ScheduleOverview({
  interviews,
}: {
  interviews: OverviewInterview[];
}) {
  const router = useRouter();
  const [view, setView] = useState<"calendar" | "list">("calendar");

  const events = useMemo(
    () =>
      interviews.map((i) => {
        const stageLabel = STAGE_LABELS[i.stage] ?? i.stage;
        return {
          id: i.id,
          title: `${i.candidateName} — ${stageLabel}`,
          start: toScheduleXLocal(i.startsAt),
          end: toScheduleXLocal(i.endsAt),
          calendarId: i.status,
          description: i.jdTitle ? `For: ${i.jdTitle}` : undefined,
        };
      }),
    [interviews],
  );

  // Events service plugin lets us update the calendar's events imperatively
  // after the calendar app is built. Without it, useNextCalendarApp captures
  // events on first call and never refreshes — so after cancelling an
  // interview, the chip would still show on the calendar until the user
  // refreshed the page.
  const eventsServicePlugin = useMemo(() => createEventsServicePlugin(), []);

  const calendar = useNextCalendarApp(
    {
      views: [
        createViewMonthGrid(),
        createViewWeek(),
        createViewDay(),
        createViewMonthAgenda(),
      ],
      defaultView: "month-grid",
      events,
      calendars: CALENDAR_CATEGORIES,
      callbacks: {
        onEventClick(event) {
          const interview = interviews.find((i) => i.id === event.id);
          if (interview) {
            router.push(`/candidates/${interview.candidateId}`);
          }
        },
      },
    },
    [eventsServicePlugin],
  );

  // Keep the calendar's events in sync with the parent's interviews prop.
  // router.refresh() updates `interviews`, which updates `events`, which we
  // then push into the calendar's internal store via the plugin. Without
  // this, cancelling or rescheduling didn't reflect on the calendar until
  // the user hard-refreshed.
  useEffect(() => {
    if (!calendar) return;
    eventsServicePlugin.set(events);
  }, [calendar, events, eventsServicePlugin]);

  return (
    <Tabs
      value={view}
      onValueChange={(v) => setView(v as "calendar" | "list")}
      className="space-y-4"
    >
      <TabsList>
        <TabsTrigger value="calendar">Calendar</TabsTrigger>
        <TabsTrigger value="list">List ({interviews.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="calendar">
        {interviews.length === 0 ? (
          <EmptyState />
        ) : (
          <CalendarWithContextMenu
            calendarApp={calendar}
            interviews={interviews}
          />
        )}
      </TabsContent>

      <TabsContent value="list">
        {interviews.length === 0 ? (
          <EmptyState />
        ) : (
          <InterviewsList interviews={interviews} />
        )}
      </TabsContent>
    </Tabs>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-sand-200 bg-cream/40 p-10 text-center">
      <p className="font-display text-xl text-navy">No interviews yet</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-charcoal">
        Click <span className="font-medium">Schedule interview</span> above to
        drop the first one onto your calendar.
      </p>
    </div>
  );
}

function InterviewsList({
  interviews,
}: {
  interviews: OverviewInterview[];
}) {
  const router = useRouter();
  // Sort: upcoming first (ascending), then past (descending).
  const now = Date.now();
  const sorted = useMemo(() => {
    const upcoming: OverviewInterview[] = [];
    const past: OverviewInterview[] = [];
    for (const i of interviews) {
      if (new Date(i.startsAt).getTime() >= now && i.status === "scheduled") {
        upcoming.push(i);
      } else {
        past.push(i);
      }
    }
    upcoming.sort(
      (a, b) => +new Date(a.startsAt) - +new Date(b.startsAt),
    );
    past.sort((a, b) => +new Date(b.startsAt) - +new Date(a.startsAt));
    return [...upcoming, ...past];
  }, [interviews, now]);

  return (
    <ul className="space-y-2">
      {sorted.map((i) => {
        const start = new Date(i.startsAt);
        const end = new Date(i.endsAt);
        const durationMin = Math.round(
          (end.getTime() - start.getTime()) / 60000,
        );
        const isUpcoming =
          start.getTime() >= now && i.status === "scheduled";
        const statusStyles: Record<OverviewInterview["status"], string> = {
          scheduled: isUpcoming
            ? "bg-success/10 text-success"
            : "bg-sand-100 text-charcoal",
          rescheduled: "bg-info/10 text-info",
          completed: "bg-sand-100 text-charcoal",
          cancelled: "bg-warning/15 text-warning",
          no_show: "bg-danger/15 text-danger",
        };

        return (
          <li key={i.id}>
            <button
              type="button"
              onClick={() => router.push(`/candidates/${i.candidateId}`)}
              className="flex w-full flex-wrap items-center justify-between gap-3 rounded-md border border-sand-200 bg-warm-white px-4 py-3 text-left text-sm transition-colors hover:bg-cream"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={cn(
                    "rounded-sm px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                    statusStyles[i.status],
                  )}
                >
                  {i.status.replace("_", " ")}
                </span>
                <span className="font-medium text-navy">{i.candidateName}</span>
                <span className="text-[11px] text-slate-deep">
                  {STAGE_LABELS[i.stage] ?? i.stage}
                </span>
                {i.jdTitle && (
                  <span className="text-[11px] text-slate-mid">
                    · {i.jdTitle}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-[11px] text-slate-deep">
                  {start.toLocaleString("en-GB", {
                    timeZone: "Asia/Bangkok",
                    hour12: false,
                    weekday: "short",
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="text-[11px] text-slate-mid">
                  {durationMin} min
                </span>
                {i.meetUrl && (
                  <a
                    href={i.meetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[11px] font-medium text-terracotta-700 underline-offset-4 hover:underline"
                  >
                    Meet
                  </a>
                )}
                <span onClick={(e) => e.stopPropagation()}>
                  <InterviewActions
                    interviewId={i.id}
                    startsAt={i.startsAt}
                    endsAt={i.endsAt}
                    candidateName={i.candidateName}
                    isCanceled={i.status === "cancelled"}
                  />
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Wraps the Schedule-X calendar with a right-click context menu so users can
 * reschedule or cancel an interview without leaving the calendar view.
 *
 * Schedule-X tags every event element with `data-event-id="<id>"`, so we walk
 * up from the contextmenu target until we find that attribute. If we land on
 * one, we look up the interview, suppress the browser's native menu, and
 * render our own at the cursor.
 */
function CalendarWithContextMenu({
  calendarApp,
  interviews,
}: {
  calendarApp: ReturnType<typeof useNextCalendarApp>;
  interviews: OverviewInterview[];
}) {
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<{
    interview: OverviewInterview;
    x: number;
    y: number;
  } | null>(null);
  const [reschedule, setReschedule] = useState<OverviewInterview | null>(null);
  const [cancelling, setCancelling] = useState<OverviewInterview | null>(null);
  const [busy, setBusy] = useState(false);
  // Active Schedule-X view ("month-grid" | "week" | "day" | "month-agenda" |
  // "list"). Drives the data-view attr on the wrapper, which lets CSS
  // target view-specific styling (week-only layout reorder, week-only
  // time-fade-on-hover, etc.).
  const [currentView, setCurrentView] = useState<string>("month-grid");

  useEffect(() => {
    if (!calendarApp) return;
    // Schedule-X v2 doesn't expose `calendarState` publicly on the
    // CalendarApp type — it's only on the internal `$app` (private in TS,
    // public at runtime). Cast through `unknown` to reach the view signal.
    // The shape is stable across the v2 line.
    const internal = calendarApp as unknown as {
      $app?: {
        calendarState?: {
          view?: {
            value: string;
            subscribe: (cb: (v: string) => void) => () => void;
          };
        };
      };
    };
    const viewSignal = internal.$app?.calendarState?.view;
    if (!viewSignal) return;
    setCurrentView(viewSignal.value);
    return viewSignal.subscribe((v) => setCurrentView(v));
  }, [calendarApp]);

  // Mark event elements whose title actually overflows their chip so CSS can
  // marquee-scroll ONLY those on hover. Short titles that already fit stay
  // visually static. Uses a MutationObserver because Schedule-X re-renders
  // event DOM on view change / event update without a React lifecycle hook
  // we can attach to.
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const applyTruncation = () => {
      const inlineTitles = wrapper.querySelectorAll<HTMLElement>(
        ".sx__time-grid-event-title, .sx__list-event-title",
      );
      inlineTitles.forEach((el) => {
        el.classList.toggle("is-truncated", el.scrollWidth > el.clientWidth);
      });
      const monthChips = wrapper.querySelectorAll<HTMLElement>(
        ".sx__month-grid-event",
      );
      monthChips.forEach((el) => {
        el.classList.toggle("is-truncated", el.scrollWidth > el.clientWidth);
      });
    };

    applyTruncation();
    const observer = new MutationObserver(applyTruncation);
    observer.observe(wrapper, { childList: true, subtree: true });
    window.addEventListener("resize", applyTruncation);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", applyTruncation);
    };
  }, [interviews, currentView]);

  // Reschedule dialog state — pre-filled from the selected interview each
  // time the dialog opens.
  const [whenAt, setWhenAt] = useState("");
  const [durationMin, setDurationMin] = useState<number>(30);

  useEffect(() => {
    if (reschedule) {
      setWhenAt(isoToLocalInput(reschedule.startsAt));
      const dur = Math.max(
        15,
        Math.round(
          (new Date(reschedule.endsAt).getTime() -
            new Date(reschedule.startsAt).getTime()) /
            60_000,
        ),
      );
      setDurationMin(dur);
    }
  }, [reschedule]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const eventEl = target?.closest("[data-event-id]") as HTMLElement | null;
      if (!eventEl) return;
      const eventId = eventEl.getAttribute("data-event-id");
      const interview = interviews.find((i) => i.id === eventId);
      if (!interview) return;
      e.preventDefault();
      setMenu({ interview, x: e.clientX, y: e.clientY });
    };
    el.addEventListener("contextmenu", handler);
    return () => el.removeEventListener("contextmenu", handler);
  }, [interviews]);

  // Close the menu when clicking elsewhere or pressing Escape.
  useEffect(() => {
    if (!menu) return;
    const closeOnClick = () => setMenu(null);
    const closeOnEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("click", closeOnClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("click", closeOnClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menu]);

  async function handleCancelConfirm() {
    if (!cancelling) return;
    setBusy(true);
    try {
      const resp = await fetch(`/api/interviews/${cancelling.id}`, {
        method: "DELETE",
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        toast.error("Couldn't cancel", {
          description: json?.error ?? `HTTP ${resp.status}`,
        });
        return;
      }
      toast.success("Interview cancelled");
      setCancelling(null);
      router.refresh();
    } catch (err) {
      toast.error("Network error", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleRescheduleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reschedule) return;
    if (!whenAt || !Number.isFinite(durationMin) || durationMin <= 0) {
      toast.error("Pick a date, time, and duration");
      return;
    }
    const start = new Date(whenAt);
    const end = new Date(start.getTime() + durationMin * 60_000);

    setBusy(true);
    try {
      const resp = await fetch(`/api/interviews/${reschedule.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        toast.error("Couldn't reschedule", {
          description: json?.error ?? `HTTP ${resp.status}`,
        });
        return;
      }
      toast.success("Interview rescheduled");
      setReschedule(null);
      router.refresh();
    } catch (err) {
      toast.error("Network error", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div
        ref={wrapperRef}
        data-view={currentView}
        className="overflow-hidden rounded-lg border border-sand-200 bg-warm-white"
      >
        <ScheduleXCalendar calendarApp={calendarApp} />
      </div>

      {menu && (
        <div
          // Position-fixed so the menu sits at viewport coordinates regardless
          // of scroll. Clicking inside swallows the click so the global click
          // handler doesn't immediately close the menu.
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            left: Math.min(menu.x, window.innerWidth - 200),
            top: Math.min(menu.y, window.innerHeight - 100),
            zIndex: 50,
          }}
          className="overflow-hidden rounded-md border border-sand-200 bg-warm-white shadow-md"
        >
          <div className="border-b border-sand-100 px-3 py-2 text-[11px] text-slate-mid">
            {menu.interview.candidateName}
          </div>
          <button
            type="button"
            onClick={() => {
              setReschedule(menu.interview);
              setMenu(null);
            }}
            disabled={menu.interview.status === "cancelled"}
            className="block w-full px-3 py-2 text-left text-sm text-navy hover:bg-cream disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reschedule…
          </button>
          <button
            type="button"
            onClick={() => {
              setCancelling(menu.interview);
              setMenu(null);
            }}
            disabled={menu.interview.status === "cancelled"}
            className="block w-full px-3 py-2 text-left text-sm text-danger hover:bg-danger/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel interview
          </button>
        </div>
      )}

      <Dialog
        open={!!reschedule}
        onOpenChange={(open) => !open && setReschedule(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule interview</DialogTitle>
            <DialogDescription>
              Updates the Google Calendar event for{" "}
              <span className="font-medium text-navy">
                {reschedule?.candidateName}
              </span>
              . Attendees receive an &ldquo;Event updated&rdquo; email.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRescheduleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="cal-resched-when"
                className="text-xs text-slate-deep"
              >
                New date &amp; time
              </Label>
              <input
                id="cal-resched-when"
                type="datetime-local"
                step={900}
                value={whenAt}
                onChange={(e) => setWhenAt(e.target.value)}
                className="h-9 w-full rounded-md border border-sand-200 bg-cream px-3 text-sm text-navy"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="cal-resched-duration"
                className="text-xs text-slate-deep"
              >
                Duration
              </Label>
              <select
                id="cal-resched-duration"
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
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setReschedule(null)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!cancelling}
        onOpenChange={(open) => !open && setCancelling(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this interview?</DialogTitle>
            <DialogDescription>
              The Google Calendar event will be cancelled and{" "}
              <span className="font-medium text-navy">
                {cancelling?.candidateName}
              </span>{" "}
              will receive the standard cancellation email.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelling(null)}
              disabled={busy}
            >
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleCancelConfirm}
              disabled={busy}
            >
              {busy ? "Cancelling…" : "Yes, cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
