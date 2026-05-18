"use client";

import { useEffect, useRef, useState } from "react";
import { ScoreCard, type ScoreCardData } from "./ScoreCard";

type ErrorTelemetry = {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  cost_usd: number;
};

export function ScoreStream({
  candidateId,
  jdId,
  model,
  threshold,
  onDone,
}: {
  candidateId: string;
  jdId: string;
  model: string;
  threshold: number;
  onDone?: () => void;
}) {
  const [partialText, setPartialText] = useState("");
  const [final, setFinal] = useState<ScoreCardData | null>(null);
  const [error, setError] = useState<{
    message: string;
    telemetry?: ErrorTelemetry;
    raw?: unknown;
  } | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedRef = useRef<number>(Date.now());

  useEffect(() => {
    const controller = new AbortController();
    startedRef.current = Date.now();
    const tick = setInterval(() => {
      setElapsedMs(Date.now() - startedRef.current);
    }, 100);

    async function run() {
      try {
        const resp = await fetch("/api/score/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ candidateId, jdId, model }),
          signal: controller.signal,
        });
        if (!resp.ok || !resp.body) {
          const text = await resp.text().catch(() => "");
          setError({ message: text || `Request failed (${resp.status})` });
          return;
        }

        const reader = resp.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += value;
          let idx: number;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            handleFrame(frame);
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError({ message: err instanceof Error ? err.message : "Stream failed" });
      } finally {
        clearInterval(tick);
        onDone?.();
      }
    }

    function handleFrame(frame: string) {
      let event = "message";
      const dataLines: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }
      if (dataLines.length === 0) return;
      const data = (() => {
        try {
          return JSON.parse(dataLines.join("\n"));
        } catch {
          return null;
        }
      })();
      if (!data) return;

      if (event === "score_partial") {
        setPartialText(data.text ?? "");
      } else if (event === "score_complete") {
        const v = data.value as ScoreCardData;
        setFinal({
          scoreId: data.scoreId,
          skills_score: v.skills_score,
          experience_score: v.experience_score,
          culture_score: v.culture_score,
          weighted_total: data.weighted_total ?? v.weighted_total,
          reasoning: v.reasoning,
          strengths: v.strengths,
          gaps: v.gaps,
          prep_questions: v.prep_questions,
          hiring_report: v.hiring_report,
          passes_threshold: (data.weighted_total ?? v.weighted_total) >= threshold,
          cost_usd: data.telemetry?.cost_usd,
        });
      } else if (event === "score_error") {
        setError({
          message: data.message ?? "Unknown error",
          telemetry: data.telemetry,
          raw: data.raw,
        });
      }
    }

    run();

    return () => {
      controller.abort();
      clearInterval(tick);
    };
  }, [candidateId, jdId, model, threshold, onDone]);

  if (error) {
    return (
      <div className="space-y-3 rounded-md border border-danger/30 bg-danger/5 p-4">
        <div>
          <p className="text-sm font-medium text-danger">Scoring failed</p>
          <p className="mt-1 text-sm text-danger/90">{error.message}</p>
        </div>
        {error.telemetry && (
          <div className="rounded-md border border-danger/20 bg-warm-white px-3 py-2 text-[11px] text-charcoal">
            <p className="mb-1 font-medium text-navy">
              Tokens were spent — here&apos;s what it cost:
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono">
              <span>model</span>
              <span>{error.telemetry.model}</span>
              <span>input</span>
              <span>{error.telemetry.input_tokens.toLocaleString()}</span>
              <span>output</span>
              <span>{error.telemetry.output_tokens.toLocaleString()}</span>
              <span>cache read</span>
              <span>{error.telemetry.cache_read_input_tokens.toLocaleString()}</span>
              <span>cache write</span>
              <span>{error.telemetry.cache_creation_input_tokens.toLocaleString()}</span>
              <span className="font-medium text-terracotta-700">cost</span>
              <span className="font-medium text-terracotta-700">
                ${error.telemetry.cost_usd.toFixed(4)}
              </span>
            </div>
          </div>
        )}
        {error.raw !== undefined && (
          <details className="text-[11px]">
            <summary className="cursor-pointer text-slate-deep">
              Show what Claude actually returned
            </summary>
            <pre className="mt-2 max-h-48 overflow-y-auto rounded-md bg-warm-white p-3 font-mono text-charcoal">
              {JSON.stringify(error.raw, null, 2)}
            </pre>
          </details>
        )}
      </div>
    );
  }

  if (final) {
    return <ScoreCard data={final} />;
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-sand-200 bg-cream/40 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-navy">
          Claude is scoring… <span className="text-xs text-slate-mid">({model})</span>
        </p>
        <span className="font-mono text-xs text-slate-mid">
          {(elapsedMs / 1000).toFixed(1)}s
        </span>
      </div>
      <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-warm-white p-3 font-mono text-[11px] text-charcoal">
        {partialText || "Waiting for first token…"}
      </pre>
      <p className="text-[11px] text-slate-mid">
        Streaming the tool input live so you can see what the model is thinking.
        Final scores will render here when the stream closes.
      </p>
    </div>
  );
}
