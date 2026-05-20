"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { sendColdEmail } from "@/app/actions/emails";
import { updateCandidateStage } from "@/app/actions/candidates";

/**
 * "Draft cold email" dialog — Phase 3e.
 *
 * Lifecycle inside the open state:
 *  1. mounted → fire POST /api/emails/draft, stream the tool-input JSON
 *  2. streaming → typewriter shows extracted subject + body so far
 *  3. complete → editable form (subject Input, body Textarea, rationale below)
 *  4. send → call sendColdEmail action, toast on success, close dialog
 *
 * Closing while streaming aborts the fetch — no zombie connection.
 *
 * Why the manual regex unparse instead of incremental JSON.parse:
 * Anthropic's input_json_delta events give partial JSON chunks that are
 * valid prefixes of the final object. JSON.parse refuses to parse them
 * mid-stream, so a tiny "extract string field by name" regex pulls out
 * the subject + body for the typewriter UI. Final shape comes from the
 * draft_complete event, which carries the validated object.
 */

type Stage =
  | { kind: "streaming"; partialSubject: string; partialBody: string }
  | { kind: "complete"; subject: string; body: string; rationale: string }
  | { kind: "error"; message: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: {
    id: string;
    full_name: string;
    email: string;
    current_stage: string;
  };
  jdId: string;
  jdTitle: string;
};

/**
 * Pull a partial string value for a named JSON field out of an
 * accumulating tool-input JSON chunk. The chunk is a prefix of a valid
 * JSON object — we look for `"field": "..."` and unescape the content
 * we've seen so far. Returns null if the field hasn't started yet.
 */
function extractPartialField(
  raw: string,
  field: string,
): string | null {
  const re = new RegExp(`"${field}"\\s*:\\s*"`);
  const m = re.exec(raw);
  if (!m) return null;
  const start = m.index + m[0].length;
  // Walk forward tracking escape state so we can stop at the unescaped
  // closing quote — or, if we never see it, return everything since `start`.
  let out = "";
  let i = start;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === "\\") {
      const next = raw[i + 1];
      if (next === undefined) break; // partial escape — drop it for now
      if (next === "n") out += "\n";
      else if (next === "r") out += "\r";
      else if (next === "t") out += "\t";
      else if (next === "\\") out += "\\";
      else if (next === '"') out += '"';
      else if (next === "/") out += "/";
      else if (next === "u") {
        const hex = raw.slice(i + 2, i + 6);
        if (hex.length < 4) break;
        out += String.fromCharCode(parseInt(hex, 16));
        i += 6;
        continue;
      } else {
        out += next;
      }
      i += 2;
      continue;
    }
    if (ch === '"') break; // end of field value
    out += ch;
    i++;
  }
  return out;
}

export function ColdEmailDialog(props: Props) {
  const { open, onOpenChange, candidate, jdId, jdTitle } = props;
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({
    kind: "streaming",
    partialSubject: "",
    partialBody: "",
  });
  const [editedSubject, setEditedSubject] = useState("");
  const [editedBody, setEditedBody] = useState("");
  const [rationale, setRationale] = useState("");
  const [sending, setSending] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  // Kick off the draft stream when the dialog opens. The parent
  // (ColdEmailLauncher) mounts this component only while open === true,
  // so we don't need a !open branch — unmount handles teardown via the
  // effect cleanup below, and the next open gets a fresh component with
  // fresh state automatically.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    controllerRef.current = controller;

    async function run() {
      try {
        const resp = await fetch("/api/emails/draft", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ candidateId: candidate.id, jdId }),
          signal: controller.signal,
        });
        if (!resp.ok || !resp.body) {
          const text = await resp.text().catch(() => "");
          setStage({
            kind: "error",
            message: text || `Request failed (${resp.status})`,
          });
          return;
        }

        const reader = resp.body
          .pipeThrough(new TextDecoderStream())
          .getReader();
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
        setStage({
          kind: "error",
          message: err instanceof Error ? err.message : "Stream failed",
        });
      }
    }

    function handleFrame(frame: string) {
      let event = "message";
      const dataLines: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:"))
          dataLines.push(line.slice(5).trimStart());
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

      if (event === "draft_partial") {
        const text = (data.text ?? "") as string;
        const partialSubject = extractPartialField(text, "subject") ?? "";
        const partialBody = extractPartialField(text, "body_markdown") ?? "";
        setStage({ kind: "streaming", partialSubject, partialBody });
      } else if (event === "draft_complete") {
        const subject = (data.subject ?? "") as string;
        const body = (data.body ?? "") as string;
        const r = (data.rationale ?? "") as string;
        setStage({ kind: "complete", subject, body, rationale: r });
        setEditedSubject(subject);
        setEditedBody(body);
        setRationale(r);
      } else if (event === "draft_error") {
        setStage({
          kind: "error",
          message: data.message ?? "Unknown error",
        });
      }
    }

    run();
    return () => {
      controller.abort();
    };
  }, [open, candidate.id, jdId]);

  const handleSend = useCallback(async () => {
    if (sending) return;
    if (!editedSubject.trim() || editedBody.trim().length < 20) {
      toast.error("Subject and body are required");
      return;
    }
    setSending(true);
    const r = await sendColdEmail({
      candidateId: candidate.id,
      jdId,
      subject: editedSubject,
      body: editedBody,
      rationale,
    });
    setSending(false);
    if (!r.ok) {
      toast.error("Couldn't send", { description: r.error });
      return;
    }
    onOpenChange(false);

    const isAlreadyApplied = candidate.current_stage === "applied";
    toast.success(`Email sent to ${candidate.full_name}`, {
      description: isAlreadyApplied
        ? "Logged in the activity feed."
        : "Logged in the activity feed.",
      duration: 12000,
      action: isAlreadyApplied
        ? undefined
        : {
            label: "Move to Applied / Contacted",
            onClick: async () => {
              const stageResult = await updateCandidateStage({
                candidateId: candidate.id,
                stage: "applied",
              });
              if (!stageResult.ok) {
                toast.error("Stage move failed", {
                  description: stageResult.error,
                });
                return;
              }
              toast.success(`Moved to Applied / Contacted`);
              router.refresh();
            },
          },
    });
    router.refresh();
  }, [
    sending,
    editedSubject,
    editedBody,
    rationale,
    candidate.id,
    candidate.full_name,
    candidate.current_stage,
    jdId,
    onOpenChange,
    router,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Draft cold email</DialogTitle>
          <DialogDescription>
            To <span className="font-medium text-navy">{candidate.full_name}</span>{" "}
            &lt;{candidate.email}&gt; · for{" "}
            <span className="font-medium text-navy">{jdTitle}</span>
          </DialogDescription>
        </DialogHeader>

        {stage.kind === "streaming" && (
          <StreamingPane
            partialSubject={stage.partialSubject}
            partialBody={stage.partialBody}
          />
        )}

        {stage.kind === "complete" && (
          <EditablePane
            subject={editedSubject}
            setSubject={setEditedSubject}
            body={editedBody}
            setBody={setEditedBody}
            rationale={rationale}
            sending={sending}
            onSend={handleSend}
            onCancel={() => onOpenChange(false)}
          />
        )}

        {stage.kind === "error" && (
          <ErrorPane message={stage.message} onClose={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function StreamingPane({
  partialSubject,
  partialBody,
}: {
  partialSubject: string;
  partialBody: string;
}) {
  const hasAny = partialSubject.length > 0 || partialBody.length > 0;
  return (
    <div className="space-y-3 rounded-md border border-dashed border-sand-200 bg-cream/40 p-4">
      <div className="flex items-center gap-2">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-info" />
        <p className="text-sm font-medium text-navy">Claude is drafting…</p>
      </div>
      {!hasAny ? (
        <p className="text-xs text-slate-mid">
          Waiting for the first token. This usually takes a couple of seconds.
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-deep">
              Subject
            </p>
            <p className="rounded-sm bg-warm-white px-3 py-2 text-sm text-navy">
              {partialSubject || (
                <span className="text-slate-mid">…</span>
              )}
            </p>
          </div>
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-deep">
              Body
            </p>
            <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-sm bg-warm-white px-3 py-2 font-sans text-sm text-charcoal">
              {partialBody || <span className="text-slate-mid">…</span>}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function EditablePane({
  subject,
  setSubject,
  body,
  setBody,
  rationale,
  sending,
  onSend,
  onCancel,
}: {
  subject: string;
  setSubject: (s: string) => void;
  body: string;
  setBody: (s: string) => void;
  rationale: string;
  sending: boolean;
  onSend: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-deep">
          Subject
        </label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          maxLength={200}
          disabled={sending}
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-deep">
          Body
        </label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={12}
          maxLength={4000}
          disabled={sending}
          className="font-sans text-sm leading-relaxed"
        />
        <p className="mt-1 text-[10px] text-slate-mid">
          Edits stay client-side until you click Send. Your signature (if set
          in Settings → Integrations) is appended automatically when sent.
        </p>
      </div>
      {rationale && (
        <details className="rounded-md border border-sand-200 bg-cream/40">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-navy">
            Why this hook (Claude&apos;s rationale)
          </summary>
          <p className="border-t border-sand-200 px-3 py-2 text-xs text-charcoal">
            {rationale}
          </p>
        </details>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={sending}>
          Cancel
        </Button>
        <Button onClick={onSend} disabled={sending}>
          {sending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}

function ErrorPane({
  message,
  onClose,
}: {
  message: string;
  onClose: () => void;
}) {
  return (
    <div className="space-y-3 rounded-md border border-danger/30 bg-danger/5 p-4">
      <div>
        <p className="text-sm font-medium text-danger">Draft failed</p>
        <p className="mt-1 text-sm text-danger/90">{message}</p>
      </div>
      <div className="flex justify-end">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}
