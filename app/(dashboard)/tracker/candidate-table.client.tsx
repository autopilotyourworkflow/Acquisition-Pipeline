"use client";

import { useMemo, useState } from "react";
import { StageBadge } from "@/components/candidates/StageBadge";
import { SourceBadge } from "@/components/candidates/SourceBadge";
import {
  CANDIDATE_SOURCES,
  CANDIDATE_STAGES,
  SOURCE_LABELS,
  STAGE_LABELS,
  type CandidateSource,
  type CandidateStage,
} from "@/lib/db/enums";
import type { CandidateRow, JdRow } from "@/lib/db/types";

type CandidateWithJd = CandidateRow & { jd_title: string | null };

export function CandidateTable({
  candidates,
  jds,
}: {
  candidates: CandidateWithJd[];
  jds: JdRow[];
}) {
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
        <span className="ml-auto text-xs text-slate-mid">{filtered.length} shown</span>
      </div>

      <div className="overflow-x-auto rounded-md border border-sand-200 bg-warm-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-cream text-left">
            <tr className="border-b border-sand-200 text-xs uppercase tracking-wide text-slate-deep">
              <th className="px-3 py-2.5 font-medium">Name</th>
              <th className="px-3 py-2.5 font-medium">Title</th>
              <th className="px-3 py-2.5 font-medium">Stage</th>
              <th className="px-3 py-2.5 font-medium">Source</th>
              <th className="px-3 py-2.5 font-medium">JD</th>
              <th className="px-3 py-2.5 font-medium">Applied</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-sand-100 last:border-0 hover:bg-cream/50">
                <td className="px-3 py-2.5 font-medium text-navy">{c.full_name}</td>
                <td className="px-3 py-2.5 text-charcoal">{c.current_title ?? "—"}</td>
                <td className="px-3 py-2.5">
                  <StageBadge stage={c.stage} />
                </td>
                <td className="px-3 py-2.5">
                  <SourceBadge source={c.source} />
                </td>
                <td className="px-3 py-2.5 text-charcoal">{c.jd_title ?? "—"}</td>
                <td className="px-3 py-2.5 text-charcoal">{c.applied_at}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-sm text-slate-mid">
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
    <label className="inline-flex items-center gap-1.5 text-xs text-charcoal">
      <span className="text-slate-deep">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="rounded-md border border-sand-200 bg-warm-white px-2 py-1 text-xs text-navy focus-visible:outline-2 focus-visible:outline-terracotta"
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
