"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type ScoreCardData = {
  scoreId: string;
  skills_score: number;
  experience_score: number;
  culture_score: number;
  weighted_total: number;
  reasoning: { skills: string; experience: string; culture: string };
  strengths: string[];
  gaps: string[];
  prep_questions: string[];
  hiring_report: string;
  passes_threshold: boolean | null;
  cost_usd?: number;
};

export function ScoreCard({ data }: { data: ScoreCardData }) {
  return (
    <div className="overflow-hidden rounded-lg border border-sand-200 bg-warm-white">
      <div className="border-b border-sand-200 bg-cream/50 px-5 py-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-slate-deep">Weighted total</p>
          {data.passes_threshold !== null && (
            <span
              className={cn(
                "rounded-sm px-2 py-0.5 text-[11px] font-medium",
                data.passes_threshold
                  ? "bg-success/15 text-success"
                  : "bg-charcoal/15 text-charcoal",
              )}
            >
              {data.passes_threshold ? "Passes threshold" : "Below threshold"}
            </span>
          )}
        </div>
        <p className="mt-1 font-display text-4xl font-medium text-navy">
          {data.weighted_total.toFixed(2)}
          <span className="ml-1 text-sm text-slate-mid">/10</span>
        </p>
      </div>

      <div className="space-y-3 px-5 py-5">
        <ScoreBar
          label="Skills"
          value={data.skills_score}
          reasoning={data.reasoning.skills}
          delayMs={0}
        />
        <ScoreBar
          label="Experience"
          value={data.experience_score}
          reasoning={data.reasoning.experience}
          delayMs={80}
        />
        <ScoreBar
          label="Culture"
          value={data.culture_score}
          reasoning={data.reasoning.culture}
          delayMs={160}
        />
      </div>

      <div className="grid gap-5 border-t border-sand-100 px-5 py-5 md:grid-cols-2">
        <ListPanel title="Strengths" items={data.strengths} variant="success" />
        <ListPanel title="Gaps" items={data.gaps} variant="warning" />
      </div>

      <div className="border-t border-sand-100 px-5 py-5">
        <p className="mb-2 text-xs uppercase tracking-wide text-slate-deep">
          Interview prep questions
        </p>
        <ol className="space-y-1.5 text-sm text-charcoal">
          {data.prep_questions.map((q, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-mono text-xs text-slate-mid">{i + 1}.</span>
              <span>{q}</span>
            </li>
          ))}
        </ol>
      </div>

      <details className="border-t border-sand-100 px-5 py-4">
        <summary className="cursor-pointer text-xs uppercase tracking-wide text-slate-deep">
          Hiring report
        </summary>
        <div className="mt-3 whitespace-pre-wrap text-sm text-charcoal">
          {data.hiring_report}
        </div>
      </details>

      {typeof data.cost_usd === "number" && (
        <div className="border-t border-sand-100 bg-cream/40 px-5 py-2 text-[11px] text-slate-mid">
          Cost: ${data.cost_usd.toFixed(4)} · score id {data.scoreId.slice(0, 8)}…
        </div>
      )}
    </div>
  );
}

function ScoreBar({
  label,
  value,
  reasoning,
  delayMs,
}: {
  label: string;
  value: number;
  reasoning: string;
  delayMs: number;
}) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(value * 10), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-navy">{label}</span>
        <span className="font-mono text-sm text-charcoal">{value.toFixed(1)} / 10</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-sm bg-sand-100">
        <div
          className="h-full rounded-sm bg-terracotta transition-[width] duration-500 ease-out"
          style={{ width: `${width}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-slate-deep">{reasoning}</p>
    </div>
  );
}

function ListPanel({
  title,
  items,
  variant,
}: {
  title: string;
  items: string[];
  variant: "success" | "warning";
}) {
  const tone =
    variant === "success" ? "text-success border-success/30" : "text-warning border-warning/30";
  return (
    <div>
      <p className={cn("mb-2 inline-block border-b px-1 pb-1 text-xs uppercase tracking-wide", tone)}>
        {title}
      </p>
      <ul className="space-y-1 text-sm text-charcoal">
        {items.map((item, i) => (
          <li key={i} className="flex gap-1.5">
            <span className="text-slate-mid">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
