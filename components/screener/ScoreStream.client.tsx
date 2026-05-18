"use client";

import { useEffect, useRef, useState } from "react";
import { ScoreCard, type ScoreCardData } from "./ScoreCard";
import { cn } from "@/lib/utils";

type ErrorTelemetry = {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
  cost_usd: number;
};

type AgentState = {
  agent: number | "manager";
  temperature?: number;
  status: "pending" | "running" | "done" | "failed";
  cost_usd?: number;
};

export function ScoreStream({
  candidateId,
  jdId,
  model,
  mode,
  threshold,
  onDone,
}: {
  candidateId: string;
  jdId: string;
  model: string;
  mode: "single" | "team";
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
  const [agents, setAgents] = useState<AgentState[]>(
    mode === "team"
      ? [
          { agent: 1, temperature: 0, status: "running" },
          { agent: 2, temperature: 0.3, status: "running" },
          { agent: 3, temperature: 0.6, status: "running" },
          { agent: "manager", status: "pending" },
        ]
      : [],
  );
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
          body: JSON.stringify({ candidateId, jdId, model, mode }),
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
      } else if (event === "team_progress") {
        setAgents((cur) => {
          if (data.stage === "scorer_done") {
            return cur.map((a) =>
              a.agent === data.agent
                ? { ...a, status: "done", cost_usd: data.telemetry?.cost_usd }
                : a,
            );
          }
          if (data.stage === "scorer_failed") {
            return cur.map((a) =>
              a.agent === data.agent ? { ...a, status: "failed" } : a,
            );
          }
          if (data.stage === "manager_started") {
            return cur.map((a) =>
              a.agent === "manager" ? { ...a, status: "running" } : a,
            );
          }
          if (data.stage === "manager_done") {
            return cur.map((a) =>
              a.agent === "manager"
                ? { ...a, status: "done", cost_usd: data.telemetry?.cost_usd }
                : a,
            );
          }
          return cur;
        });
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
  }, [candidateId, jdId, model, mode, threshold, onDone]);

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

  if (mode === "team") {
    return (
      <div className="space-y-3 rounded-lg border border-dashed border-sand-200 bg-cream/40 p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-navy">
            Team scoring… <span className="text-xs text-slate-mid">({model})</span>
          </p>
          <span className="font-mono text-xs text-slate-mid">
            {(elapsedMs / 1000).toFixed(1)}s
          </span>
        </div>
        <ul className="space-y-1.5">
          {agents.map((a) => (
            <li
              key={typeof a.agent === "number" ? `agent-${a.agent}` : "manager"}
              className={cn(
                "flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors",
                a.status === "done"
                  ? "border-success/30 bg-success/5"
                  : a.status === "failed"
                    ? "border-danger/30 bg-danger/5"
                    : a.status === "running"
                      ? "border-info/30 bg-info/5"
                      : "border-sand-200 bg-warm-white",
              )}
            >
              <div className="flex items-center gap-2">
                <StatusDot status={a.status} />
                <span className="text-navy">
                  {a.agent === "manager"
                    ? "Manager (consolidates the 3 scorers)"
                    : `Scorer ${a.agent}`}
                </span>
                {typeof a.temperature === "number" && (
                  <span className="font-mono text-[10px] text-slate-mid">
                    temp {a.temperature}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 font-mono text-[11px] text-slate-deep">
                {typeof a.cost_usd === "number" && (
                  <span>${a.cost_usd.toFixed(4)}</span>
                )}
                <span>
                  {a.status === "done"
                    ? "done"
                    : a.status === "running"
                      ? "running…"
                      : a.status === "failed"
                        ? "failed"
                        : "waiting"}
                </span>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-slate-mid">
          3 scorers run in parallel at different temperatures. Manager consolidates
          into one final assessment.
        </p>
      </div>
    );
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

function StatusDot({ status }: { status: AgentState["status"] }) {
  const cls =
    status === "done"
      ? "bg-success"
      : status === "failed"
        ? "bg-danger"
        : status === "running"
          ? "bg-info animate-pulse"
          : "bg-sand-200";
  return <span className={cn("inline-block h-2 w-2 rounded-full", cls)} />;
}
