import { SOURCE_LABELS, type CandidateSource } from "@/lib/db/enums";
import { cn } from "@/lib/utils";

// Outbound sources get a yellow underline accent so HR can scan a list
// and tell which candidates were sourced vs which applied in.
const OUTBOUND_SOURCES: ReadonlySet<CandidateSource> = new Set([
  "linkedin",
  "jobsdb",
  "thirdparty_api",
  "outbound_sourced",
  "extension",
]);

export function SourceBadge({
  source,
  className,
}: {
  source: CandidateSource;
  className?: string;
}) {
  const isOutbound = OUTBOUND_SOURCES.has(source);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm border border-soft-gray bg-off-white px-1.5 py-0.5 text-[10px] font-medium text-black",
        isOutbound && "border-b-2 border-b-yellow",
        className,
      )}
    >
      {SOURCE_LABELS[source]}
    </span>
  );
}
