"use client";

import { useEffect, useRef, useState } from "react";
import { ScoreCard, type ScoreCardData } from "./ScoreCard";

/**
 * Hosts the SSE EventSource lifecycle for /api/score/run. Renders a streaming
 * view of accumulated tool-input text while Claude scores, then swaps to the
 * final ScoreCard on `score_complete`.
 *
 * EventSource is GET-only by spec, so we fall back to a fetch() + ReadableStream
 * reader for our POST endpoint. The protocol on the wire is still SSE-formatted
 * (event: / data: / blank line), which keeps the server side conventional.
 */
export function ScoreStream({
  candidateId,
  jdId,
  threshold,
  onDone,
}: {
  candidateId: string;
  jdId: string;
  threshold: number;
  onDone?: () => void;
}) {
  const [partialText, setPartialText] = useState("");
  const [final, setFinal] = useState<ScoreCardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedRef = useRef<number>(Date.now());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    startedRef.current = Date.now();
    const tick = setInterval(() => {
      setElapsedMs(Date.now() - startedRef.current);
    }, 100);

    async function run() {
      try {
        const resp = await fetch("/api/score/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ candidateId, jdId }),
          signal: controller.signal,
        });
        if (!resp.ok || !resp.body) {
          const text = await resp.text().catch(() => "");
          setError(text || `Request failed (${resp.status})`);
          return;
        }

        const reader = resp.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += value;
          // Parse SSE frames: events terminated by blank line.
          let idx: number;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            handleFrame(frame);
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Stream failed");
      } finally {
        clearInterval(tick);
        onDone?.();
      }
    }

    function handleFrame(frame: string) {
      let event = "message";
      let dataLines: string[] = [];
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
        setError(data.message ?? "Unknown error");
      }
    }

    run();

    return () => {
      controller.abort();
      clearInterval(tick);
    };
  }, [candidateId, jdId, threshold, onDone]);

  if (error) {
    return (
      <div className="rounded-md border border-danger/30 bg-danger/5 p-4 text-sm text-danger">
        <p className="font-medium">Scoring failed</p>
        <p className="mt-1 font-mono text-xs">{error}</p>
      </div>
    );
  }

  if (final) {
    return <ScoreCard data={final} />;
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-sand-200 bg-cream/40 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-navy">Claude is scoring…</p>
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
