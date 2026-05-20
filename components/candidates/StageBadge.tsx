import { STAGE_LABELS, type CandidateStage } from "@/lib/db/enums";
import { cn } from "@/lib/utils";

// Funnel-stage palette inside the Hotel Plus register (yellow + black + grays).
// Visual narrative: cool entry → yellow saturation ramps across the active stages
// → inverted black-on-yellow for offer (terminal pending) → bold yellow for hired
// → desaturated gray for rejected. Order encodes progress at a glance.
const STAGE_CLASSES: Record<CandidateStage, string> = {
  sourced: "bg-off-white text-gray border border-soft-gray",
  applied: "bg-yellow-pale text-black border border-soft-gray",
  screening: "bg-yellow-tint text-black border border-soft-gray",
  prescreen_call: "bg-yellow-tint text-black border border-yellow",
  first_interview: "bg-yellow text-black border border-yellow",
  offer: "bg-black text-yellow border border-black",
  hired: "bg-yellow text-black border border-black font-semibold",
  rejected: "bg-soft-gray text-gray border border-soft-gray",
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
