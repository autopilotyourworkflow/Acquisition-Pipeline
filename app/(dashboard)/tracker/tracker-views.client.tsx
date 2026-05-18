"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "./kanban-board.client";
import { CandidateTable } from "./candidate-table.client";
import { NewCandidateDialog } from "./new-candidate-dialog.client";
import type { CandidateRow, JdRow } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type ViewKey = "kanban" | "table";

const LS_KEY = "tracker.view";

type CandidateWithJd = CandidateRow & { jd_title: string | null };

export function TrackerViews({
  candidates,
  jds,
}: {
  candidates: CandidateWithJd[];
  jds: JdRow[];
}) {
  const [view, setView] = useState<ViewKey>("kanban");
  const [hydrated, setHydrated] = useState(false);

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
        <KanbanBoard candidates={candidates} jds={jds} />
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
