import { SOURCE_LABELS, type CandidateSource } from "@/lib/db/enums";
import { cn } from "@/lib/utils";

export function SourceBadge({
  source,
  className,
}: {
  source: CandidateSource;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm bg-sand-100 px-1.5 py-0.5 text-[10px] font-medium text-charcoal",
        className,
      )}
    >
      {SOURCE_LABELS[source]}
    </span>
  );
}
