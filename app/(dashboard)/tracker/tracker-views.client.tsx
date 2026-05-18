"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { KanbanBoard } from "./kanban-board.client";
import { CandidateTable } from "./candidate-table.client";
import { NewCandidateDialog } from "./new-candidate-dialog.client";
import { updateCandidateStage } from "@/app/actions/candidates";
import type { CandidateRow, JdRow } from "@/lib/db/types";
import { STAGE_LABELS, type CandidateStage } from "@/lib/db/enums";
import { cn } from "@/lib/utils";

type ViewKey = "kanban" | "table";
const LS_KEY = "tracker.view";

type CandidateWithJd = CandidateRow & { jd_title: string | null };

export function TrackerViews({
  candidates: initialCandidates,
  jds,
}: {
  candidates: CandidateWithJd[];
  jds: JdRow[];
}) {
  const router = useRouter();
  const [view, setView] = useState<ViewKey>("kanban");
  const [hydrated, setHydrated] = useState(false);

  // Lifted state: TrackerViews owns the candidates list. Kanban and Table
  // both read from the same source, so drag-then-switch-view doesn't lose
  // the optimistic move. Resynced whenever the server prop changes (after
  // a router.refresh() or revalidatePath fires).
  const [candidates, setCandidates] = useState(initialCandidates);
  useEffect(() => {
    setCandidates(initialCandidates);
  }, [initialCandidates]);

  const [, startTransition] = useTransition();

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LS_KEY);
      if (stored === "table" || stored === "kanban") setView(stored);
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(LS_KEY, view);
    } catch {
      // ignore
    }
  }, [view, hydrated]);

  const moveCandidateStage = useCallback(
    (candidateId: string, nextStage: CandidateStage) => {
      const before = candidates;
      const target = before.find((c) => c.id === candidateId);
      if (!target || target.stage === nextStage) return;

      // Optimistic: update local state immediately. Both Kanban and Table see it.
      setCandidates((cur) =>
        cur.map((c) => (c.id === candidateId ? { ...c, stage: nextStage } : c)),
      );

      startTransition(async () => {
        const result = await updateCandidateStage({ candidateId, stage: nextStage });
        if (!result.ok) {
          setCandidates(before);
          toast.error("Couldn't move candidate", { description: result.error });
          return;
        }
        toast.success(
          `Moved ${target.full_name} → ${STAGE_LABELS[nextStage]}`,
          { description: "Activity logged. Undo coming Day 4." },
        );
        // Background sync — pulls in any related changes (updated_at, row_hash).
        router.refresh();
      });
    },
    [candidates, router],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-md border border-sand-200 bg-warm-white p-0.5 text-sm">
          <ViewTab active={view === "kanban"} onClick={() => setView("kanban")}>
            Kanban
          </ViewTab>
          <ViewTab active={view === "table"} onClick={() => setView("table")}>
            Table
          </ViewTab>
        </div>
        <NewCandidateDialog jds={jds} />
      </div>

      {candidates.length === 0 ? (
        <EmptyState />
      ) : view === "kanban" ? (
        <KanbanBoard
          candidates={candidates}
          jds={jds}
          onMove={moveCandidateStage}
        />
      ) : (
        <CandidateTable candidates={candidates} jds={jds} />
      )}
    </div>
  );
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-sm px-3 py-1 text-xs font-medium transition-colors",
        active ? "bg-navy text-cream" : "text-charcoal hover:bg-sand-100",
      )}
    >
      {children}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-sand-200 bg-cream/40 p-12 text-center">
      <p className="font-display text-xl text-navy">No candidates yet</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-charcoal">
        Add one manually with{" "}
        <span className="rounded-sm bg-terracotta-50 px-1.5 py-0.5 font-medium text-terracotta-700">
          + New candidate
        </span>
        , or wait for Day 3 when the Scraper module pulls candidates from
        LinkedIn / pasted text / PDFs / screenshots.
      </p>
    </div>
  );
}
