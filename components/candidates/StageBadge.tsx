import { STAGE_LABELS, type CandidateStage } from "@/lib/db/enums";
import { cn } from "@/lib/utils";

const STAGE_CLASSES: Record<CandidateStage, string> = {
  // Sourced reads as "passive / untouched" — cooler/quieter than Applied's
  // warm sand. Navy/10 keeps it on-brand without competing with the action
  // colors downstream (offer, hired, rejected).
  sourced: "bg-navy/10 text-navy",
  applied: "bg-sand-100 text-charcoal",
  screening: "bg-info/10 text-info",
  prescreen_call: "bg-info/15 text-info",
  first_interview: "bg-warning/15 text-warning",
  offer: "bg-terracotta-50 text-terracotta-700",
  hired: "bg-success/15 text-success",
  rejected: "bg-danger/10 text-danger",
};

export function StageBadge({
  stage,
  className,
}: {
  stage: CandidateStage;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-0.5 text-[11px] font-medium",
        STAGE_CLASSES[stage],
        className,
      )}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}
