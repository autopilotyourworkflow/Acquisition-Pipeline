"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
} from "@dnd-kit/core";
import { CANDIDATE_STAGES, type CandidateStage } from "@/lib/db/enums";
import { StageBadge } from "@/components/candidates/StageBadge";
import { SourceBadge } from "@/components/candidates/SourceBadge";
import {
  InterviewIndicator,
  type LatestInterview,
} from "@/components/candidates/InterviewIndicator";
import type { CandidateRow } from "@/lib/db/types";
import { cn } from "@/lib/utils";

/**
 * Combined collision detection. `pointerWithin` is the most precise —
 * it returns the droppable the user's cursor is literally inside. We
 * fall back to `rectIntersection` when the cursor isn't directly over
 * any droppable (e.g. fast drags where the cursor leaves the column).
 *
 * This replaces the previous `closestCenter` which compared *center
 * points* — fine for symmetric grids but flaky for tall narrow columns,
 * because the "closest center" to a card's center during a drag can
 * end up being the column the card came FROM (or a column with more
 * cards filling the area) rather than the one the cursor is actually
 * over. The "can't drop on Applied / Contacted" symptom was that:
 * with the cursor over Applied, closestCenter would still bias toward
 * the source column whose density matched the dragged card's vertical
 * position more closely.
 */
const collisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return rectIntersection(args);
};

type CandidateWithJd = CandidateRow & {
  jd_title: string | null;
  latest_score: number | null;
  latest_interview: LatestInterview | null;
};

/**
 * KanbanBoard is now a controlled component. The mutation is owned by
 * TrackerViews so view-switching during a drop doesn't lose the optimistic
 * state, and the Table view sees the move instantly.
 */
export function KanbanBoard({
  candidates,
  onMove,
  onEdit,
}: {
  candidates: CandidateWithJd[];
  onMove: (candidateId: string, nextStage: CandidateStage) => void;
  onEdit: (candidateId: string) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const byStage: Record<CandidateStage, CandidateWithJd[]> = Object.fromEntries(
    CANDIDATE_STAGES.map((s) => [s, [] as CandidateWithJd[]]),
  ) as Record<CandidateStage, CandidateWithJd[]>;
  for (const c of candidates) byStage[c.stage].push(c);

  function onDragEnd(event: DragEndEvent) {
    const overId = event.over?.id;
    const activeId = event.active.id;
    if (!overId || typeof overId !== "string" || typeof activeId !== "string") return;
    if (!CANDIDATE_STAGES.includes(overId as CandidateStage)) return;
    onMove(activeId, overId as CandidateStage);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      onDragEnd={onDragEnd}
    >
      <div className="flex gap-3 overflow-x-auto pb-2">
        {CANDIDATE_STAGES.map((stage) => (
          <KanbanColumn
            key={stage}
            stage={stage}
            cards={byStage[stage]}
            onEdit={onEdit}
          />
        ))}
      </div>
    </DndContext>
  );
}

function KanbanColumn({
  stage,
  cards,
  onEdit,
}: {
  stage: CandidateStage;
  cards: CandidateWithJd[];
  onEdit: (candidateId: string) => void;
}) {
  // Make the ENTIRE column wrapper the droppable area (including the header)
  // so a drop on the badge / count counts as a drop on the column. Previous
  // version had the droppable only on the inner card list, which left a
  // ~28px "dead zone" at the top of every column. Combined with the new
  // pointerWithin collision detection, this makes the drop target match
  // the column's visible bounds.
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div
      ref={setNodeRef}
      data-stage={stage}
      className={cn(
        // w-60 (240px) so the 8-column wide board fits on a 1920×1080 monitor
        // when the dashboard layout's max-w-7xl is removed for tracker (see
        // app/(dashboard)/tracker/page.tsx). Cards still readable at this width.
        "flex w-60 shrink-0 flex-col rounded-md border border-dashed p-2 transition-colors",
        isOver
          ? "border-black bg-yellow-pale/40"
          : "border-soft-gray bg-white/30",
      )}
    >
      <div className="mb-2 flex items-center justify-between px-1">
        <StageBadge stage={stage} />
        <span className="text-xs text-gray">{cards.length}</span>
      </div>
      <div className="flex min-h-[280px] flex-col gap-2">
        {cards.map((c) => (
          <KanbanCard key={c.id} candidate={c} onEdit={onEdit} />
        ))}
        {cards.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-gray">Empty</p>
        )}
      </div>
    </div>
  );
}

function KanbanCard({
  candidate,
  onEdit,
}: {
  candidate: CandidateWithJd;
  onEdit: (candidateId: string) => void;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: candidate.id,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  // dnd-kit's PointerSensor with activationConstraint distance:5 means a quick
  // click (no movement) won't initiate drag — so onPointerUp without a drag
  // start is treated as a navigation click. We track the pointer-down position
  // in refs (not let-vars) because event handlers reassign them outside the
  // render pass — React 19's purity rule requires non-state mutation to go
  // through refs.
  const downXRef = useRef(0);
  const downYRef = useRef(0);
  const dragStartedRef = useRef(false);

  function onPointerDown(e: React.PointerEvent) {
    downXRef.current = e.clientX;
    downYRef.current = e.clientY;
    dragStartedRef.current = false;
  }
  function onPointerMove(e: React.PointerEvent) {
    if (
      Math.hypot(
        e.clientX - downXRef.current,
        e.clientY - downYRef.current,
      ) > 5
    ) {
      dragStartedRef.current = true;
    }
  }
  function onPointerUp() {
    if (!dragStartedRef.current && !isDragging) {
      router.push(`/candidates/${candidate.id}`);
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onPointerDownCapture={onPointerDown}
      onPointerMoveCapture={onPointerMove}
      onPointerUpCapture={onPointerUp}
      className={cn(
        "cursor-grab rounded-md border border-soft-gray bg-white p-3 text-left shadow-xs transition-shadow",
        "hover:shadow-sm focus-visible:outline-2 focus-visible:outline-yellow",
        isDragging && "opacity-50 shadow-md cursor-grabbing",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-black">{candidate.full_name}</p>
        <div className="flex items-center gap-1">
          {candidate.latest_score !== null && (
            <ScoreBadge score={candidate.latest_score} />
          )}
          <button
            type="button"
            // Stop both the synthetic click and the pointer-down so the
            // surrounding card doesn't (a) navigate to the detail page or
            // (b) start a drag when the user just wanted to edit.
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(candidate.id);
            }}
            title="Edit candidate"
            aria-label={`Edit ${candidate.full_name}`}
            className="cursor-pointer rounded-sm p-1 text-gray transition-colors hover:bg-off-white hover:text-black"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
            >
              <path
                d="M11.5 1.5L14.5 4.5M2 14L5.5 13L13.5 5L11 2.5L3 10.5L2 14Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>
      {candidate.current_title && (
        <p className="mt-0.5 text-xs text-black">{candidate.current_title}</p>
      )}
      <div className="mt-2 flex items-center gap-1.5">
        <SourceBadge source={candidate.source} />
        {candidate.jd_title && (
          <span className="text-[10px] text-gray">{candidate.jd_title}</span>
        )}
      </div>
      {candidate.latest_interview && (
        <div className="mt-1.5">
          <InterviewIndicator interview={candidate.latest_interview} compact />
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  // Tone: low (red), mid (warning), high (success). Thresholds are advisory.
  const tone =
    score >= 8 ? "bg-success/15 text-success" : score >= 6 ? "bg-warning/15 text-warning" : "bg-danger/10 text-danger";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-medium",
        tone,
      )}
      title="Latest weighted score"
    >
      {score.toFixed(1)}
    </span>
  );
}
