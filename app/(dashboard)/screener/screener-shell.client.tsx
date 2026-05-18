"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScoreStream } from "@/components/screener/ScoreStream.client";
import type { CandidateRow, JdRow } from "@/lib/db/types";

type ModelChoice = "claude-haiku-4-5" | "claude-opus-4-7";

const MODEL_OPTIONS: { value: ModelChoice; label: string; hint: string }[] = [
  {
    value: "claude-haiku-4-5",
    label: "Haiku 4.5 — fast & cheap",
    hint: "~$0.01–0.03 per score · 8–15s · use while testing",
  },
  {
    value: "claude-opus-4-7",
    label: "Opus 4.7 — top quality",
    hint: "~$0.15–0.25 per score · 25–40s · final decisions",
  },
];

type Props = {
  candidates: CandidateRow[];
  jds: JdRow[];
  parsedTextLengths: Record<string, number>;
};

export function ScreenerShell({ candidates, jds, parsedTextLengths }: Props) {
  const router = useRouter();
  const [candidateId, setCandidateId] = useState(candidates[0]?.id ?? "");
  const candidate = candidates.find((c) => c.id === candidateId) ?? null;
  const [jdId, setJdId] = useState<string>(candidate?.jd_id ?? jds[0]?.id ?? "");
  const jd = jds.find((j) => j.id === jdId) ?? null;
  const [model, setModel] = useState<ModelChoice>("claude-haiku-4-5");
  const [run, setRun] = useState<{
    candidateId: string;
    jdId: string;
    model: ModelChoice;
  } | null>(null);
  const [uploading, startUploadTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parsedLen = useMemo(() => parsedTextLengths[candidateId] ?? 0, [candidateId, parsedTextLengths]);

  function onPickCandidate(id: string) {
    setCandidateId(id);
    const c = candidates.find((x) => x.id === id);
    if (c?.jd_id) setJdId(c.jd_id);
    setRun(null);
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
    setRun({ candidateId, jdId, model });
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
            onChange={(e) => setJdId(e.target.value)}
            className="h-9 w-full rounded-md border border-sand-200 bg-cream px-3 text-sm text-navy"
          >
            {jds.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title} (threshold {j.threshold})
              </option>
            ))}
          </select>
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
          Run score
        </Button>
      </div>

      {run && (
        <ScoreStream
          key={`${run.candidateId}:${run.jdId}:${run.model}:${Date.now()}`}
          candidateId={run.candidateId}
          jdId={run.jdId}
          model={run.model}
          threshold={jd?.threshold ?? 7}
        />
      )}
    </div>
  );
}
