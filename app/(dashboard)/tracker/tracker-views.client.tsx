"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
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

type CandidateWithJd = CandidateRow & {
  jd_title: string | null;
  latest_score: number | null;
};

/**
 * Track the view preference in localStorage with SSR-safe hydration.
 * `useSyncExternalStore` is the React 19 blessed way to integrate with
 * external state — its `getServerSnapshot` argument keeps SSR + client
 * first render in lockstep (both return 'table'), avoiding the hydration
 * mismatch that a `useState(() => readLocalStorage())` would risk.
 *
 * The subscribe callback listens for both cross-tab `storage` events
 * AND a custom `tracker-view-changed` event we dispatch ourselves on
 * same-tab writes — same-tab `setItem` does NOT fire the native event.
 */
function subscribeView(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener("tracker-view-changed", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("tracker-view-changed", callback);
  };
}
function readView(): ViewKey {
  try {
    const v = window.localStorage.getItem(LS_KEY);
    return v === "kanban" ? "kanban" : "table";
  } catch {
    return "table";
  }
}
function writeView(next: ViewKey): void {
  try {
    window.localStorage.setItem(LS_KEY, next);
    window.dispatchEvent(new Event("tracker-view-changed"));
  } catch {
    // ignore
  }
}

export function TrackerViews({
  candidates: initialCandidates,
  jds,
}: {
  candidates: CandidateWithJd[];
  jds: JdRow[];
}) {
  const router = useRouter();
  // Default to table — denser information display for a recruiting team that
  // mostly scans names + stages. Kanban is one click away and persists in
  // localStorage once chosen.
  const view = useSyncExternalStore(
    subscribeView,
    readView,
    () => "table" as ViewKey,
  );
  const setView = useCallback((next: ViewKey) => writeView(next), []);

  // Lifted state: TrackerViews owns the candidates list. Kanban and Table
  // both read from the same source, so drag-then-switch-view doesn't lose
  // the optimistic move. Resynced whenever the server prop changes (after
  // router.refresh() or revalidatePath fires).
  //
  // The setState-in-effect rule's lint warning is genuinely the right call
  // for typical use cases — but here it's the standard "prop-as-initial-
  // value + server-driven resets" pattern. The setState fires once per
  // server response, no cascading renders, no perf concern. The earlier
  // attempt to use a setState-during-render compare pattern subtly broke
  // optimistic moves to specific columns, so we're back on the boring,
  // proven path with the rule explicitly opted out.
  const [candidates, setCandidates] = useState(initialCandidates);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCandidates(initialCandidates);
  }, [initialCandidates]);

  const [, startTransition] = useTransition();

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

        const logId = result.data.logId;
        toast.success(`Moved ${target.full_name} → ${STAGE_LABELS[nextStage]}`, {
          description: "Click Undo within 30 seconds to revert.",
          duration: 30000,
          action: logId
            ? {
                label: "Undo",
                onClick: async () => {
                  const resp = await fetch("/api/audit/undo", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ logId }),
                  });
                  const json = await resp.json().catch(() => ({}));
                  if (!resp.ok) {
                    toast.error("Undo failed", {
                      description: json?.error ?? `HTTP ${resp.status}`,
                    });
                    return;
                  }
                  // Server reverted — restore the snapshot locally too.
                  setCandidates(before);
                  toast.success("Reverted");
                  router.refresh();
                },
              }
            : undefined,
        });
        router.refresh();
      });
    },
    [candidates, router],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="inline-flex rounded-md border border-sand-200 bg-warm-white p-0.5 text-sm">
          <ViewTab active={view === "table"} onClick={() => setView("table")}>
            Table
          </ViewTab>
          <ViewTab active={view === "kanban"} onClick={() => setView("kanban")}>
            Kanban
          </ViewTab>
        </div>
        <NewCandidateDialog jds={jds} />
      </div>

      {candidates.length === 0 ? (
        <EmptyState />
      ) : view === "kanban" ? (
        <KanbanBoard
          candidates={candidates}
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
      <p className="font-display text-xl text-navy">Empty pipeline</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-charcoal">
        Use{" "}
        <span className="rounded-sm bg-terracotta-50 px-1.5 py-0.5 font-medium text-terracotta-700">
          + New candidate
        </span>{" "}
        to add someone manually. Bulk import from LinkedIn, paste, PDF, and
        screenshot is coming next.
      </p>
    </div>
  );
}
