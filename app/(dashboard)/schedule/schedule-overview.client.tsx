"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ScheduleXCalendar, useNextCalendarApp } from "@schedule-x/react";
import {
  createViewDay,
  createViewMonthAgenda,
  createViewMonthGrid,
  createViewWeek,
} from "@schedule-x/calendar";
import "@schedule-x/theme-default/dist/index.css";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type OverviewInterview = {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string | null;
  jdTitle: string | null;
  stage: string;
  status: "scheduled" | "completed" | "canceled" | "no_show";
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
      main: "#16a34a", // success
      container: "#dcfce7",
      onContainer: "#14532d",
    },
    darkColors: {
      main: "#16a34a",
      onContainer: "#dcfce7",
      container: "#14532d",
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
  canceled: {
    colorName: "canceled",
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

  const calendar = useNextCalendarApp({
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
  });

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
          <div className="overflow-hidden rounded-lg border border-sand-200 bg-warm-white">
            <ScheduleXCalendar calendarApp={calendar} />
          </div>
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
          completed: "bg-sand-100 text-charcoal",
          canceled: "bg-warning/15 text-warning",
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
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
