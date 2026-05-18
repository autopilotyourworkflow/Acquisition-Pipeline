"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScoreStream } from "@/components/screener/ScoreStream.client";
import { ScoreCard, type ScoreCardData } from "@/components/screener/ScoreCard";
import type { CandidateRow, JdRow } from "@/lib/db/types";
import { cn } from "@/lib/utils";

type ModelChoice = "claude-haiku-4-5" | "claude-opus-4-7";
type ScoringMode = "single" | "team";

export type PastScore = {
  id: string;
  candidate_id: string;
  jd_id: string;
  skills_score: number;
  experience_score: number;
  culture_score: number;
  weighted_total: number;
  reasoning: { skills: string; experience: string; culture: string };
  strengths: string[];
  gaps: string[];
  prep_questions: string[];
  hiring_report: string | null;
  model: string;
  prompt_version: string;
  scoring_mode: "single" | "team";
  cost_usd: number | null;
  created_at: string;
};

const MODEL_OPTIONS: { value: ModelChoice; label: string; hint: string }[] = [
  {
    value: "claude-haiku-4-5",
    label: "Haiku 4.5 — fast & cheap",
    hint: "~$0.01 single · ~$0.04 team · 8–15s",
  },
  {
    value: "claude-opus-4-7",
    label: "Opus 4.7 — top quality",
    hint: "~$0.20 single · ~$0.80 team · 25–40s",
  },
];

const MODE_OPTIONS: { value: ScoringMode; label: string; hint: string }[] = [
  {
    value: "single",
    label: "Single agent",
    hint: "One Claude call at temperature 0. Fast, cheap, mostly stable.",
  },
  {
    value: "team",
    label: "Team of 3 + manager",
    hint: "3 scorers at temps 0/0.3/0.6 in parallel → manager consolidates. ~4x cost, very stable.",
  },
];

type Props = {
  candidates: CandidateRow[];
  jds: JdRow[];
  parsedTextLengths: Record<string, number>;
  pastScores: PastScore[];
};

function pastScoreToCardData(
  s: PastScore,
  threshold: number | null,
): ScoreCardData {
  return {
    scoreId: s.id,
    skills_score: s.skills_score,
    experience_score: s.experience_score,
    culture_score: s.culture_score,
    weighted_total: s.weighted_total,
    reasoning: s.reasoning,
    strengths: s.strengths,
    gaps: s.gaps,
    prep_questions: s.prep_questions,
    hiring_report: s.hiring_report ?? "",
    passes_threshold: threshold !== null ? s.weighted_total >= threshold : null,
    cost_usd: s.cost_usd ?? undefined,
  };
}

export function ScreenerShell({
  candidates,
  jds,
  parsedTextLengths,
  pastScores,
}: Props) {
  const router = useRouter();
  const [candidateId, setCandidateId] = useState(candidates[0]?.id ?? "");
  const candidate = candidates.find((c) => c.id === candidateId) ?? null;
  const [jdId, setJdId] = useState<string>(candidate?.jd_id ?? jds[0]?.id ?? "");
  const jd = jds.find((j) => j.id === jdId) ?? null;
  const [model, setModel] = useState<ModelChoice>("claude-haiku-4-5");
  const [mode, setMode] = useState<ScoringMode>("single");
  const [run, setRun] = useState<{
    candidateId: string;
    jdId: string;
    model: ModelChoice;
    mode: ScoringMode;
  } | null>(null);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [uploading, startUploadTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsedLen = useMemo(
    () => parsedTextLengths[candidateId] ?? 0,
    [candidateId, parsedTextLengths],
  );

  // Past runs for the currently-selected (candidate, JD) pair.
  const relevantHistory = useMemo(
    () =>
      pastScores
        .filter((s) => s.candidate_id === candidateId && s.jd_id === jdId)
        .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
    [pastScores, candidateId, jdId],
  );

  const displayedScore = useMemo(() => {
    if (relevantHistory.length === 0) return null;
    if (selectedHistoryId) {
      return relevantHistory.find((s) => s.id === selectedHistoryId) ?? relevantHistory[0];
    }
    return relevantHistory[0];
  }, [relevantHistory, selectedHistoryId]);

  function onPickCandidate(id: string) {
    setCandidateId(id);
    const c = candidates.find((x) => x.id === id);
    if (c?.jd_id) setJdId(c.jd_id);
    setRun(null);
    setSelectedHistoryId(null);
  }

  function onPickJd(id: string) {
    setJdId(id);
    setRun(null);
    setSelectedHistoryId(null);
  }

  function onUploadCv(file: File) {
    if (!candidateId) {
      toast.error("Pick a candidate first");
      return;
    }
    if (file.type && file.type !== "application/pdf") {
      toast.error("Please upload a PDF");
      return;
    }
    startUploadTransition(async () => {
      const form = new FormData();
      form.append("candidateId", candidateId);
      form.append("file", file);
      const resp = await fetch("/api/attachments/upload", { method: "POST", body: form });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        toast.error("Upload failed", { description: json?.error ?? `HTTP ${resp.status}` });
        return;
      }
      const chars = json.parsedTextLength?.toLocaleString?.() ?? "?";
      toast.success(
        json.reused ? "Same PDF detected — reused cached extract" : "CV uploaded + parsed",
        { description: `${chars} chars cached${json.reused ? " (no re-parse)" : ""}` },
      );
      router.refresh();
    });
  }

  function onRunScore() {
    if (!candidateId || !jdId) {
      toast.error("Pick a candidate and a JD");
      return;
    }
    setRun({ candidateId, jdId, model, mode });
    setSelectedHistoryId(null);
  }

  if (candidates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-sand-200 bg-cream/40 p-12 text-center">
        <p className="font-display text-xl text-navy">No candidates to score yet</p>
        <p className="mt-2 text-sm text-charcoal">
          Add one from the{" "}
          <a className="text-terracotta-700 underline" href="/tracker">Tracker</a>.
        </p>
      </div>
    );
  }
  if (jds.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-sand-200 bg-cream/40 p-12 text-center">
        <p className="font-display text-xl text-navy">No JDs to score against</p>
        <p className="mt-2 text-sm text-charcoal">
          Create one from the{" "}
          <a className="text-terracotta-700 underline" href="/jds/new">JDs page</a>.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-lg border border-sand-200 bg-warm-white p-5 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="candidate" className="text-xs text-slate-deep">
            Candidate
          </Label>
          <select
            id="candidate"
            value={candidateId}
            onChange={(e) => onPickCandidate(e.target.value)}
            className="h-9 w-full rounded-md border border-sand-200 bg-cream px-3 text-sm text-navy"
          >
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
                {c.current_title ? ` — ${c.current_title}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="jd" className="text-xs text-slate-deep">
            Job description
          </Label>
          <select
            id="jd"
            value={jdId}
            onChange={(e) => onPickJd(e.target.value)}
            className="h-9 w-full rounded-md border border-sand-200 bg-cream px-3 text-sm text-navy"
          >
            {jds.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title} (threshold {j.threshold})
              </option>
            ))}
          </select>
          {jd?.scoring_persona_override && (
            <p className="text-[11px] text-terracotta-700">
              ✱ This JD uses a custom scoring persona override.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="model" className="text-xs text-slate-deep">
            Model
          </Label>
          <select
            id="model"
            value={model}
            onChange={(e) => setModel(e.target.value as ModelChoice)}
            className="h-9 w-full rounded-md border border-sand-200 bg-cream px-3 text-sm text-navy"
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-mid">
            {MODEL_OPTIONS.find((m) => m.value === model)?.hint}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mode" className="text-xs text-slate-deep">
            Scoring mode
          </Label>
          <select
            id="mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as ScoringMode)}
            className="h-9 w-full rounded-md border border-sand-200 bg-cream px-3 text-sm text-navy"
          >
            {MODE_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-mid">
            {MODE_OPTIONS.find((m) => m.value === mode)?.hint}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-slate-deep">CV PDF</Label>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadCv(f);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={uploading || !candidateId}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? "Parsing…" : parsedLen > 0 ? "Replace PDF" : "Upload PDF"}
            </Button>
            <span className="text-[11px] text-slate-mid">
              {parsedLen > 0
                ? `${parsedLen.toLocaleString()} chars cached (dedup'd on re-upload)`
                : "No CV uploaded"}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-sand-200 bg-cream p-4">
        <div className="text-xs text-charcoal">
          {candidate && jd && (
            <>
              Scoring{" "}
              <span className="font-medium text-navy">{candidate.full_name}</span>
              {" against "}
              <span className="font-medium text-navy">{jd.title}</span>
              {parsedLen === 0 && (
                <span className="ml-2 rounded-sm bg-warning/15 px-1.5 py-0.5 text-warning">
                  No CV — using profile data only
                </span>
              )}
            </>
          )}
        </div>
        <Button onClick={onRunScore} disabled={!candidateId || !jdId || uploading}>
          {relevantHistory.length > 0 ? "Score again" : "Run score"}
        </Button>
      </div>

      {/* Live run takes precedence when active. */}
      {run ? (
        <ScoreStream
          key={`${run.candidateId}:${run.jdId}:${run.model}:${run.mode}:${Date.now()}`}
          candidateId={run.candidateId}
          jdId={run.jdId}
          model={run.model}
          mode={run.mode}
          threshold={jd?.threshold ?? 7}
          onDone={() => router.refresh()}
        />
      ) : displayedScore ? (
        <div className="space-y-3">
          <PastRunBadge
            score={displayedScore}
            isLatest={displayedScore.id === relevantHistory[0]?.id}
          />
          <ScoreCard data={pastScoreToCardData(displayedScore, jd?.threshold ?? null)} />
          {relevantHistory.length > 1 && (
            <PastRunsList
              runs={relevantHistory}
              selectedId={displayedScore.id}
              onSelect={setSelectedHistoryId}
            />
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-sand-200 bg-cream/40 p-8 text-center text-sm text-charcoal">
          No previous scores for this candidate + JD. Click <span className="font-medium">Run score</span> to start.
        </div>
      )}
    </div>
  );
}

function PastRunBadge({
  score,
  isLatest,
}: {
  score: PastScore;
  isLatest: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-sand-200 bg-warm-white px-3 py-2 text-[11px] text-charcoal">
      <span className="font-medium text-navy">
        {isLatest ? "Latest score" : "Past score"}
      </span>
      <span className="font-mono text-slate-deep">
        {new Date(score.created_at).toLocaleString("en-GB", {
          timeZone: "Asia/Bangkok",
          hour12: false,
        })}
      </span>
      <span className="rounded-sm bg-sand-100 px-1.5 py-0.5 font-mono">
        {score.model}
      </span>
      <span
        className={cn(
          "rounded-sm px-1.5 py-0.5",
          score.scoring_mode === "team"
            ? "bg-terracotta-50 text-terracotta-700"
            : "bg-sand-100",
        )}
      >
        {score.scoring_mode === "team" ? "team (3+1)" : "single"}
      </span>
      <span className="font-mono text-slate-mid">
        prompt: {score.prompt_version}
      </span>
      {score.cost_usd !== null && (
        <span className="ml-auto font-mono text-slate-deep">
          ${score.cost_usd.toFixed(4)}
        </span>
      )}
    </div>
  );
}

function PastRunsList({
  runs,
  selectedId,
  onSelect,
}: {
  runs: PastScore[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <details className="rounded-md border border-sand-200 bg-warm-white">
      <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-navy">
        Previous runs ({runs.length - 1} more)
      </summary>
      <ul className="divide-y divide-sand-100 border-t border-sand-100">
        {runs.map((r) => {
          const isSelected = r.id === selectedId;
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(r.id)}
                className={cn(
                  "flex w-full items-center justify-between px-4 py-2 text-left text-sm",
                  isSelected ? "bg-terracotta-50/50" : "hover:bg-cream",
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono text-base font-medium text-navy">
                    {r.weighted_total.toFixed(2)}
                  </span>
                  <span className="text-[11px] text-slate-deep">
                    {new Date(r.created_at).toLocaleString("en-GB", {
                      timeZone: "Asia/Bangkok",
                      hour12: false,
                    })}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-mid">
                  <span className="font-mono">{r.model}</span>
                  <span
                    className={cn(
                      "rounded-sm px-1.5 py-0.5",
                      r.scoring_mode === "team"
                        ? "bg-terracotta-50 text-terracotta-700"
                        : "bg-sand-100",
                    )}
                  >
                    {r.scoring_mode}
                  </span>
                  {isSelected && (
                    <span className="font-medium text-terracotta-700">viewing</span>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </details>
  );
}
