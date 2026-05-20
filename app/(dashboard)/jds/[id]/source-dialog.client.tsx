"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SOURCING_PLATFORM_LABELS } from "@/lib/sourcing/types";
import type { SourcingPlatform } from "@/lib/sourcing/types";

/**
 * Per-N + per-platform cost estimate, in USD. Matches the formula in
 * docs/phase-3d-outbound-sourcing.md. The recorded `cost_usd` on the
 * sourcing_runs row reflects actual spend (which may differ).
 */
type ApifyMode = "Short" | "Full" | "Full + email search";

function estimateCost(
  n: number,
  enabled: Set<SourcingPlatform>,
  mode: ApifyMode,
): number {
  const opus = 0.05; // Opus query-derive (one-time)
  // Apify harvestapi pricing: $0.10 per page of up to 25 in Short,
  // plus $0.004/profile in Full, plus $0.01/profile in Full+email.
  const pages = enabled.has("linkedin") ? Math.ceil(n / 25) : 0;
  const perProfile = mode === "Short" ? 0 : mode === "Full" ? 0.004 : 0.01;
  const apify = enabled.has("linkedin") ? pages * 0.1 + n * perProfile : 0;
  const scoring = 0.01 * n; // Haiku per candidate
  return opus + apify + scoring;
}

type LogLine = { kind: "info" | "ok" | "warn" | "err"; text: string };

export function SourceCandidatesDialog({
  jdId,
  jdTitle,
}: {
  jdId: string;
  jdTitle: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(20);
  const [mode, setMode] = useState<ApifyMode>("Short");
  const [platforms, setPlatforms] = useState<Set<SourcingPlatform>>(
    new Set(["linkedin"]),
  );
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [stats, setStats] = useState({ found: 0, scored: 0, cost: 0 });
  const abortRef = useRef<AbortController | null>(null);

  const estCost = useMemo(
    () => estimateCost(n, platforms, mode),
    [n, platforms, mode],
  );

  function toggle(p: SourcingPlatform) {
    setPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      return next;
    });
  }

  function appendLog(line: LogLine) {
    setLog((l) => [...l, line]);
  }

  async function run() {
    if (platforms.size === 0) {
      toast.error("Pick at least one platform");
      return;
    }
    setRunning(true);
    setLog([]);
    setStats({ found: 0, scored: 0, cost: 0 });
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/source/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jdId,
          platforms: Array.from(platforms),
          n,
          mode,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        appendLog({ kind: "err", text: errBody?.error ?? "Run failed to start" });
        setRunning(false);
        return;
      }

      const reader = res.body?.pipeThrough(new TextDecoderStream()).getReader();
      if (!reader) {
        appendLog({ kind: "err", text: "No response stream" });
        setRunning(false);
        return;
      }

      let buffer = "";
      let finalCost = 0;
      let finalFound = 0;
      let scored = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += value;
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          let event = "message";
          const dataLines: string[] = [];
          for (const line of frame.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
          }
          if (dataLines.length === 0) continue;
          let payload: Record<string, unknown> = {};
          try {
            payload = JSON.parse(dataLines.join("\n"));
          } catch {
            continue;
          }

          switch (event) {
            case "run_started":
              appendLog({ kind: "info", text: "Run started." });
              break;
            case "query_derived": {
              const q = payload.query as
                | { keywords?: string[]; titles?: string[] }
                | undefined;
              appendLog({
                kind: "info",
                text: `Derived query → keywords: [${(q?.keywords ?? []).join(", ")}]${
                  q?.titles && q.titles.length > 0
                    ? `; titles: [${q.titles.join(", ")}]`
                    : ""
                }`,
              });
              break;
            }
            case "provider_started":
              appendLog({
                kind: "info",
                text: `${SOURCING_PLATFORM_LABELS[payload.platform as SourcingPlatform]}: searching for ${payload.n_target} candidate(s)…`,
              });
              break;
            case "candidate_found": {
              const name = (payload.candidate as { full_name?: string })?.full_name ?? "candidate";
              appendLog({
                kind: "ok",
                text: `Found ${name} (${SOURCING_PLATFORM_LABELS[payload.platform as SourcingPlatform]})`,
              });
              finalFound += 1;
              setStats((s) => ({ ...s, found: finalFound }));
              break;
            }
            case "candidate_scored": {
              const w = payload.weighted_total as number | null;
              scored += 1;
              appendLog({
                kind: "ok",
                text: `Scored — weighted total ${w !== null ? w.toFixed(1) : "—"}`,
              });
              setStats((s) => ({ ...s, scored }));
              break;
            }
            case "provider_done":
              appendLog({
                kind: payload.note === "not_implemented" ? "warn" : "info",
                text: `${SOURCING_PLATFORM_LABELS[payload.platform as SourcingPlatform]} done: ${payload.n_found} found${payload.note ? ` (${payload.note})` : ""}`,
              });
              break;
            case "error":
              appendLog({ kind: "warn", text: String(payload.message ?? "Unknown error") });
              break;
            case "done":
              finalCost = Number(payload.cost_usd) || 0;
              setStats((s) => ({
                ...s,
                cost: finalCost,
                found: Number(payload.n_found) || s.found,
              }));
              appendLog({
                kind: payload.status === "done" ? "ok" : "err",
                text: `Finished. ${payload.n_found} candidate(s), $${finalCost.toFixed(2)} spent.`,
              });
              break;
          }
        }
      }

      router.refresh();
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        appendLog({ kind: "warn", text: "Cancelled by user." });
      } else {
        appendLog({
          kind: "err",
          text: err instanceof Error ? err.message : "Unknown error",
        });
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (running && !o) {
          // Don't let escape close mid-run — cancel explicitly.
          return;
        }
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Find candidates for this JD</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Find candidates — {jdTitle}</DialogTitle>
          <DialogDescription>
            Distill the JD into a sourcing query, fan out across the selected
            platforms, and auto-score each new candidate against this JD.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-slate-deep">Platforms</Label>
            <div className="flex flex-wrap gap-3">
              <PlatformBox
                platform="linkedin"
                checked={platforms.has("linkedin")}
                onToggle={() => toggle("linkedin")}
                disabled={running}
              />
              <PlatformBox
                platform="jobsdb"
                checked={false}
                onToggle={() => {}}
                disabled
                title="JobsDB has no public candidate listings. Use the bookmarklet (Settings → Integrations) or email auto-import to capture from your JobsDB inbox."
              />
              <PlatformBox
                platform="indeed"
                checked={false}
                onToggle={() => {}}
                disabled
                title="Coming soon — awaiting employer-account integration"
              />
              <PlatformBox
                platform="seek"
                checked={false}
                onToggle={() => {}}
                disabled
                title="Coming soon — awaiting employer-account integration"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="n" className="text-xs text-slate-deep">
                Candidates (5–50)
              </Label>
              <Input
                id="n"
                type="number"
                min={5}
                max={50}
                value={n}
                onChange={(e) =>
                  setN(Math.max(5, Math.min(50, Number(e.target.value) || 5)))
                }
                disabled={running}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mode" className="text-xs text-slate-deep">
                Scraper mode
              </Label>
              <select
                id="mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as ApifyMode)}
                disabled={running}
                className="w-full h-9 rounded-md border border-sand-200 bg-warm-white px-2 text-sm text-navy focus:border-terracotta focus:outline-none"
              >
                <option value="Short">Short — name + headline (cheapest)</option>
                <option value="Full">Full — + experience / education</option>
                <option value="Full + email search">Full + email — also looks up email</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-deep">Est. cost</Label>
              <div className="rounded-md border border-sand-200 bg-cream/40 px-3 py-1.5 text-sm font-mono text-navy">
                ${estCost.toFixed(2)}
              </div>
            </div>
          </div>

          {(log.length > 0 || running) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-slate-deep">Progress</Label>
                <div className="text-[11px] text-slate-mid font-mono">
                  found: {stats.found} · scored: {stats.scored} · spent: $
                  {stats.cost.toFixed(2)}
                </div>
              </div>
              <div className="h-48 overflow-y-auto rounded-md border border-sand-200 bg-cream/30 p-3 font-mono text-[11px]">
                {log.map((l, i) => (
                  <div
                    key={i}
                    className={
                      l.kind === "err"
                        ? "text-danger"
                        : l.kind === "warn"
                          ? "text-warning"
                          : l.kind === "ok"
                            ? "text-success"
                            : "text-charcoal"
                    }
                  >
                    {l.text}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {!running ? (
            <>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={running}
              >
                Close
              </Button>
              <Button asChild variant="outline">
                <Link href="/tracker">View tracker</Link>
              </Button>
              <Button onClick={run} disabled={platforms.size === 0}>
                {log.length > 0 ? "Run again" : "Run"}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={cancel}>
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlatformBox({
  platform,
  checked,
  onToggle,
  disabled,
  note,
  title,
}: {
  platform: SourcingPlatform;
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  note?: string;
  title?: string;
}) {
  return (
    <label
      title={title}
      className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
        disabled
          ? "cursor-not-allowed border-sand-200 bg-sand-200/30 text-slate-mid"
          : checked
            ? "border-terracotta bg-terracotta/5 text-navy"
            : "border-sand-200 bg-warm-white text-charcoal hover:border-terracotta/50"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        disabled={disabled}
        className="accent-terracotta"
      />
      <span>{SOURCING_PLATFORM_LABELS[platform]}</span>
      {note && (
        <span className="text-[10px] uppercase tracking-wider text-slate-mid">
          {note}
        </span>
      )}
      {disabled && !note && (
        <span className="text-[10px] uppercase tracking-wider text-slate-mid">
          soon
        </span>
      )}
    </label>
  );
}
