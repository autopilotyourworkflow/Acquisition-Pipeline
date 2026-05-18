"use client";

import { useOptimistic, useTransition } from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCenter,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { updateCandidateStage } from "@/app/actions/candidates";
import { CANDIDATE_STAGES, STAGE_LABELS, type CandidateStage } from "@/lib/db/enums";
import { StageBadge } from "@/components/candidates/StageBadge";
import { SourceBadge } from "@/components/candidates/SourceBadge";
import type { CandidateRow, JdRow } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type CandidateWithJd = CandidateRow & { jd_title: string | null };

export function KanbanBoard({
  candidates,
  jds: _jds,
}: {
  candidates: CandidateWithJd[];
  jds: JdRow[];
}) {
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(
    candidates,
    (
      state,
      change: { id: string; stage: CandidateStage },
    ): CandidateWithJd[] =>
      state.map((c) =>
        c.id === change.id ? { ...c, stage: change.stage } : c,
      ),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const byStage: Record<CandidateStage, CandidateWithJd[]> = Object.fromEntries(
    CANDIDATE_STAGES.map((s) => [s, [] as CandidateWithJd[]]),
  ) as Record<CandidateStage, CandidateWithJd[]>;
  for (const c of optimistic) byStage[c.stage].push(c);

  function onDragEnd(event: DragEndEvent) {
    const overId = event.over?.id;
    const activeId = event.active.id;
    if (!overId || typeof overId !== "string" || typeof activeId !== "string") return;
    if (!CANDIDATE_STAGES.includes(overId as CandidateStage)) return;

    const candidate = optimistic.find((c) => c.id === activeId);
    if (!candidate) return;
    const nextStage = overId as CandidateStage;
    if (candidate.stage === nextStage) return;

    startTransition(async () => {
      setOptimistic({ id: activeId, stage: nextStage });
      const result = await updateCandidateStage({
        candidateId: activeId,
        stage: nextStage,
      });
      if (!result.ok) {
        toast.error("Couldn't move candidate", { description: result.error });
        // The transition will revert when revalidatePath runs from the action,
        // but we've already shown the user the right state. Sonner explains
        // the failure.
      } else {
        toast.success(
          `Moved ${candidate.full_name} → ${STAGE_LABELS[nextStage]}`,
          {
            description: "Activity logged. Undo coming Day 4.",
          },
        );
      }
    });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {CANDIDATE_STAGES.map((stage) => (
          <KanbanColumn key={stage} stage={stage} cards={byStage[stage]} />
        ))}
      </div>
    </DndContext>
  );
}

function KanbanColumn({
  stage,
  cards,
}: {
  stage: CandidateStage;
  cards: CandidateWithJd[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <StageBadge stage={stage} />
        <span className="text-xs text-slate-mid">{cards.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[300px] flex-col gap-2 rounded-md border border-dashed p-2 transition-colors",
          isOver
            ? "border-terracotta bg-terracotta-50/40"
            : "border-sand-200 bg-cream/30",
        )}
      >
        {cards.map((c) => (
          <KanbanCard key={c.id} candidate={c} />
        ))}
        {cards.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-slate-mid">Empty</p>
        )}
      </div>
    </div>
  );
}

function KanbanCard({ candidate }: { candidate: CandidateWithJd }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: candidate.id,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "cursor-grab rounded-md border border-sand-200 bg-warm-white p-3 text-left shadow-xs transition-shadow",
        "hover:shadow-sm focus-visible:outline-2 focus-visible:outline-terracotta",
        isDragging && "opacity-50 shadow-md cursor-grabbing",
      )}
    >
      <p className="text-sm font-medium text-navy">{candidate.full_name}</p>
      {candidate.current_title && (
        <p className="mt-0.5 text-xs text-charcoal">{candidate.current_title}</p>
      )}
      <div className="mt-2 flex items-center gap-1.5">
        <SourceBadge source={candidate.source} />
        {candidate.jd_title && (
          <span className="text-[10px] text-slate-mid">{candidate.jd_title}</span>
        )}
      </div>
    </div>
  );
}
