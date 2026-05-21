"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { StageBadge } from "@/components/candidates/StageBadge";
import { SourceBadge } from "@/components/candidates/SourceBadge";
import {
  InterviewIndicator,
  type LatestInterview,
} from "@/components/candidates/InterviewIndicator";
import {
  CANDIDATE_SOURCES,
  CANDIDATE_STAGES,
  SOURCE_LABELS,
  STAGE_LABELS,
  type CandidateSource,
  type CandidateStage,
} from "@/lib/db/enums";
import type { CandidateRow, JdRow } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type CandidateWithJd = CandidateRow & {
  jd_title: string | null;
  latest_score: number | null;
  latest_interview: LatestInterview | null;
};

export function CandidateTable({
  candidates,
  jds,
  onEdit,
}: {
  candidates: CandidateWithJd[];
  jds: JdRow[];
  onEdit: (candidateId: string) => void;
}) {
  const router = useRouter();
  const [stageFilter, setStageFilter] = useState<CandidateStage | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<CandidateSource | "all">("all");
  const [jdFilter, setJdFilter] = useState<string | "all">("all");

  const filtered = useMemo(() => {
    return candidates.filter((c) => {
      if (stageFilter !== "all" && c.stage !== stageFilter) return false;
      if (sourceFilter !== "all" && c.source !== sourceFilter) return false;
      if (jdFilter !== "all" && c.jd_id !== jdFilter) return false;
      return true;
    });
  }, [candidates, stageFilter, sourceFilter, jdFilter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect<CandidateStage | "all">
          label="Stage"
          value={stageFilter}
          onChange={setStageFilter}
          options={[
            { value: "all", label: "All stages" },
            ...CANDIDATE_STAGES.map((s) => ({ value: s, label: STAGE_LABELS[s] })),
          ]}
        />
        <FilterSelect<CandidateSource | "all">
          label="Source"
          value={sourceFilter}
          onChange={setSourceFilter}
          options={[
            { value: "all", label: "All sources" },
            ...CANDIDATE_SOURCES.map((s) => ({ value: s, label: SOURCE_LABELS[s] })),
          ]}
        />
        <FilterSelect<string | "all">
          label="JD"
          value={jdFilter}
          onChange={setJdFilter}
          options={[
            { value: "all", label: "All JDs" },
            ...jds.map((j) => ({ value: j.id, label: j.title })),
          ]}
        />
        <span className="ml-auto text-xs text-gray">{filtered.length} shown</span>
      </div>

      <div className="overflow-x-auto rounded-md border border-soft-gray bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-white text-left">
            <tr className="border-b border-soft-gray text-xs uppercase tracking-wide text-black">
              <th className="px-3 py-2.5 font-medium">Name</th>
              <th className="px-3 py-2.5 font-medium">Title</th>
              <th className="px-3 py-2.5 font-medium">Stage</th>
              <th className="px-3 py-2.5 font-medium">Score</th>
              <th className="px-3 py-2.5 font-medium">Source</th>
              <th className="px-3 py-2.5 font-medium">JD</th>
              <th className="px-3 py-2.5 font-medium">Interview</th>
              <th className="px-3 py-2.5 font-medium">Applied</th>
              <th className="px-3 py-2.5 font-medium text-right">Edit</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr
                key={c.id}
                onClick={() => router.push(`/candidates/${c.id}`)}
                className="cursor-pointer border-b border-off-white last:border-0 hover:bg-white/50"
              >
                <td className="px-3 py-2.5 font-medium text-black">{c.full_name}</td>
                <td className="px-3 py-2.5 text-black">{c.current_title ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <StageBadge stage={c.stage} />
                </td>
                <td className="px-3 py-2.5">
                  {c.latest_score !== null ? <ScoreCell score={c.latest_score} /> : <span className="text-gray">—</span>}
                </td>
                <td className="px-3 py-2.5">
                  <SourceBadge source={c.source} />
                </td>
                <td className="px-3 py-2.5 text-black">{c.jd_title ?? "—"}</td>
                <td className="px-3 py-2.5">
                  {c.latest_interview ? (
                    <InterviewIndicator interview={c.latest_interview} />
                  ) : (
                    <span className="text-gray">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-black">{c.applied_at}</td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit(c.id);
                    }}
                    className="rounded-sm border border-soft-gray bg-white px-2 py-1 text-[11px] font-medium text-black transition-colors hover:bg-off-white"
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-gray">
                  No candidates match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScoreCell({ score }: { score: number }) {
  const tone =
    score >= 8 ? "bg-success/15 text-success" : score >= 6 ? "bg-warning/15 text-warning" : "bg-danger/10 text-danger";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-medium",
        tone,
      )}
    >
      {score.toFixed(1)}
    </span>
  );
}

function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs text-black">
      <span className="text-black">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="rounded-md border border-soft-gray bg-white px-2 py-1 text-xs text-black focus-visible:outline-2 focus-visible:outline-yellow"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
