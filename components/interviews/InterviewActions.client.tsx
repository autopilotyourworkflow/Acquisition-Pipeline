"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConflictWarning } from "@/components/schedule/ConflictWarning";
import { useConflictCheck } from "@/hooks/use-conflict-check";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";

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

export type InterviewActionsProps = {
  interviewId: string;
  startsAt: string;
  endsAt: string;
  candidateName: string;
  isCanceled?: boolean;
};

export function InterviewActions({
  interviewId,
  startsAt,
  endsAt,
  candidateName,
  isCanceled,
}: InterviewActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  // Pre-fill the reschedule form from current values.
  const initialDurationMin = Math.max(
    15,
    Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000),
  );
  const [whenAt, setWhenAt] = useState(() => isoToLocalInput(startsAt));
  const [durationMin, setDurationMin] = useState<number>(initialDurationMin);
  const [notes, setNotes] = useState("");

  // Conflict check only fires while the reschedule dialog is open — no point
  // querying Google in the background when the dialog isn't mounted on
  // screen.
  const { conflicts, checking } = useConflictCheck({
    whenAt,
    durationMin,
    enabled: rescheduleOpen,
  });

  async function handleCancel() {
    setBusy(true);
    try {
      const resp = await fetch(`/api/interviews/${interviewId}`, {
        method: "DELETE",
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        toast.error("Couldn't cancel", {
          description: json?.error ?? `HTTP ${resp.status}`,
        });
        return;
      }
      toast.success("Interview canceled", {
        description: `Google Calendar will send a cancellation email to ${candidateName}.`,
      });
      setConfirmCancelOpen(false);
      router.refresh();
    } catch (err) {
      toast.error("Network error", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleReschedule(e: React.FormEvent) {
    e.preventDefault();
    if (!whenAt || !Number.isFinite(durationMin) || durationMin <= 0) {
      toast.error("Pick a date, time, and duration");
      return;
    }
    const start = new Date(whenAt);
    const end = new Date(start.getTime() + durationMin * 60_000);

    setBusy(true);
    try {
      const resp = await fetch(`/api/interviews/${interviewId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          notes: notes || undefined,
        }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (resp.status === 409) {
          toast.error("Google not connected", {
            description:
              json?.error ?? "Reconnect from Settings → Integrations.",
          });
        } else {
          toast.error("Couldn't reschedule", {
            description: json?.error ?? `HTTP ${resp.status}`,
          });
        }
        return;
      }
      toast.success("Interview rescheduled", {
        description: "Google Calendar will email the updated time to attendees.",
      });
      setRescheduleOpen(false);
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => e.stopPropagation()}
            disabled={busy}
            className="h-7 px-2 text-[11px]"
          >
            •••
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setRescheduleOpen(true);
            }}
            disabled={isCanceled}
          >
            Reschedule…
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setConfirmCancelOpen(true);
            }}
            className="text-danger focus:text-danger"
            disabled={isCanceled}
          >
            Cancel interview
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule interview</DialogTitle>
            <DialogDescription>
              Updates the Google Calendar event. {candidateName} and any other
              attendees receive an &ldquo;Event updated&rdquo; email.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReschedule} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="resched-when" className="text-xs text-black">
                New date &amp; time
              </Label>
              <input
                id="resched-when"
                type="datetime-local"
                step={900}
                value={whenAt}
                onChange={(e) => setWhenAt(e.target.value)}
                className="h-9 w-full rounded-md border border-soft-gray bg-white px-3 text-sm text-black"
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="resched-duration"
                className="text-xs text-black"
              >
                Duration
              </Label>
              <select
                id="resched-duration"
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                className="h-9 w-full rounded-md border border-soft-gray bg-white px-3 text-sm text-black"
              >
                {DURATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="resched-notes"
                className="text-xs text-black"
              >
                Optional notes
              </Label>
              <textarea
                id="resched-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add context the candidate should see…"
                rows={2}
                className="w-full rounded-md border border-soft-gray bg-white px-3 py-2 text-sm text-black"
              />
            </div>
            <ConflictWarning conflicts={conflicts} checking={checking} />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setRescheduleOpen(false)}
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

      <Dialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this interview?</DialogTitle>
            <DialogDescription>
              The Google Calendar event will be canceled and{" "}
              <span className="font-medium text-black">{candidateName}</span>{" "}
              will receive the standard cancellation email. The interview row
              stays on file (marked &ldquo;canceled&rdquo;) for audit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmCancelOpen(false)}
              disabled={busy}
            >
              Keep it
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleCancel}
              disabled={busy}
            >
              {busy ? "Canceling…" : "Yes, cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
