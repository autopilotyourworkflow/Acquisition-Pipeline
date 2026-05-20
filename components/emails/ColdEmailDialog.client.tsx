"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
 * "Draft cold email" dialog — Phase 3e + iteration.
 *
 * UI tour:
 *  - Top of dialog: model picker (Opus 4.7 / Haiku 4.5) + language picker
 *    (Thai default / English / Auto). Default Thai per Hotel Plus context.
 *  - "Past drafts & sends" collapsible — shows the last 10 emails for this
 *    candidate + JD so HR can load a past draft into the editor without
 *    paying for a fresh AI run.
 *  - Stream area: typewriter while drafting; switches to subject/body
 *    editor + rationale dropdown on completion.
 *  - Footer: Cancel / Regenerate / Send. Send calls the server action,
 *    which UPDATEs the autosaved draft row to status='sent' rather than
 *    inserting a duplicate.
 *
 * Behavior decisions:
 *  - On open with NO past history → auto-fires the stream with defaults.
 *  - On open WITH past history → shows the history panel first; user
 *    picks a past draft or clicks "Draft new". Avoids spending tokens
 *    when the user just wanted to re-send a previous draft.
 *  - Regenerate aborts the current stream and fires a new one with
 *    the latest picker selections.
 */

type ModelChoice = "claude-opus-4-7" | "claude-haiku-4-5";
type LanguageChoice = "th" | "en" | "auto";

export type PastEmail = {
  id: string;
  status: "drafted" | "sent" | "failed" | "discarded";
  subject: string;
  body_markdown: string;
  rationale: string | null;
  sent_at: string | null;
  gmail_message_id: string | null;
  created_at: string;
  updated_at: string;
};

type Mode =
  | { kind: "awaiting" } // history shown, user hasn't requested a draft yet
  | { kind: "streaming"; partialSubject: string; partialBody: string }
  | { kind: "ready" } // editor populated
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
  initialPastEmails: PastEmail[];
  /**
   * The user's saved signature (from /settings/email-composer). Shown
   * as a read-only preview block below the body editor so the user can
   * see what will be appended at send time. Null when nothing's
   * configured — dialog surfaces a setup prompt instead.
   */
  signature: string | null;
};

const MODEL_OPTIONS: { value: ModelChoice; label: string }[] = [
  { value: "claude-opus-4-7", label: "Opus 4.7 (best voice)" },
  { value: "claude-haiku-4-5", label: "Haiku 4.5 (cheaper, faster)" },
];

const LANGUAGE_OPTIONS: { value: LanguageChoice; label: string }[] = [
  { value: "th", label: "Thai (default)" },
  { value: "en", label: "English" },
  { value: "auto", label: "Auto (match candidate profile)" },
];

/**
 * Extract a partial string value for a named JSON field out of a streaming
 * tool-input JSON chunk. The chunk is a prefix of a valid JSON object —
 * we look for `"field": "..."` and unescape what we've seen so far.
 * Returns null if the field hasn't started yet.
 */
function extractPartialField(raw: string, field: string): string | null {
  const re = new RegExp(`"${field}"\\s*:\\s*"`);
  const m = re.exec(raw);
  if (!m) return null;
  const start = m.index + m[0].length;
  let out = "";
  let i = start;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === "\\") {
      const next = raw[i + 1];
      if (next === undefined) break;
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
    if (ch === '"') break;
    out += ch;
    i++;
  }
  return out;
}

export function ColdEmailDialog(props: Props) {
  const { open, onOpenChange, candidate, jdId, jdTitle, initialPastEmails, signature } = props;
  const router = useRouter();
  const [pastEmails, setPastEmails] = useState<PastEmail[]>(initialPastEmails);
  const [mode, setMode] = useState<Mode>(
    initialPastEmails.length === 0
      ? { kind: "streaming", partialSubject: "", partialBody: "" }
      : { kind: "awaiting" },
  );
  const [model, setModel] = useState<ModelChoice>("claude-opus-4-7");
  const [language, setLanguage] = useState<LanguageChoice>("th");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [rationale, setRationale] = useState("");
  const [currentEmailId, setCurrentEmailId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  // Helper: kick off (or re-kick off) the SSE draft stream.
  const fireDraftStream = useCallback(
    (chosenModel: ModelChoice, chosenLanguage: LanguageChoice) => {
      // Abort any in-flight stream first.
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setMode({ kind: "streaming", partialSubject: "", partialBody: "" });
      setSubject("");
      setBody("");
      setRationale("");
      setCurrentEmailId(null);

      (async () => {
        try {
          const resp = await fetch("/api/emails/draft", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              candidateId: candidate.id,
              jdId,
              model: chosenModel,
              language: chosenLanguage,
            }),
            signal: controller.signal,
          });
          if (!resp.ok || !resp.body) {
            const text = await resp.text().catch(() => "");
            setMode({
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
          setMode({
            kind: "error",
            message: err instanceof Error ? err.message : "Stream failed",
          });
        }
      })();

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
          setMode({ kind: "streaming", partialSubject, partialBody });
        } else if (event === "draft_complete") {
          const newSubject = (data.subject ?? "") as string;
          const newBody = (data.body ?? "") as string;
          const newRationale = (data.rationale ?? "") as string;
          const emailId = (data.emailId ?? null) as string | null;
          setSubject(newSubject);
          setBody(newBody);
          setRationale(newRationale);
          setCurrentEmailId(emailId);
          setMode({ kind: "ready" });
          // Optimistically prepend the new draft to the history list so the
          // user sees it immediately if they expand the history panel.
          if (emailId) {
            const nowIso = new Date().toISOString();
            setPastEmails((prev) => [
              {
                id: emailId,
                status: "drafted",
                subject: newSubject,
                body_markdown: newBody,
                rationale: newRationale,
                sent_at: null,
                gmail_message_id: null,
                created_at: nowIso,
                updated_at: nowIso,
              },
              ...prev,
            ]);
          }
        } else if (event === "draft_error") {
          setMode({
            kind: "error",
            message: data.message ?? "Unknown error",
          });
        }
      }
    },
    [candidate.id, jdId],
  );

  // Initial auto-fire when the dialog opens with no history.
  useEffect(() => {
    if (!open) return;
    if (mode.kind !== "streaming") return;
    // Only auto-fire if we haven't started yet (controllerRef empty)
    if (controllerRef.current) return;
    fireDraftStream(model, language);
    // Cleanup on unmount: abort any in-flight stream.
    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Load a past draft/send into the editor (no streaming).
  const handleLoadPast = useCallback((past: PastEmail) => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setSubject(past.subject);
    setBody(past.body_markdown);
    setRationale(past.rationale ?? "");
    // Only set currentEmailId when the row is a draft we can UPDATE on
    // send. For 'sent' rows we want a fresh insert so the original send
    // record is preserved.
    setCurrentEmailId(past.status === "drafted" ? past.id : null);
    setMode({ kind: "ready" });
    setShowHistory(false);
  }, []);

  const handleRegenerate = useCallback(() => {
    fireDraftStream(model, language);
  }, [fireDraftStream, model, language]);

  const handleSend = useCallback(async () => {
    if (sending) return;
    if (!subject.trim() || body.trim().length < 20) {
      toast.error("Subject and body are required");
      return;
    }
    setSending(true);
    const r = await sendColdEmail({
      candidateId: candidate.id,
      jdId,
      subject,
      body,
      rationale: rationale || undefined,
      emailId: currentEmailId,
    });
    setSending(false);
    if (!r.ok) {
      toast.error("Couldn't send", { description: r.error });
      return;
    }
    onOpenChange(false);

    const isAlreadyApplied = candidate.current_stage === "applied";
    toast.success(`Email sent to ${candidate.full_name}`, {
      description: "Logged in the activity feed.",
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
    subject,
    body,
    rationale,
    currentEmailId,
    candidate.id,
    candidate.full_name,
    candidate.current_stage,
    jdId,
    onOpenChange,
    router,
  ]);

  const streaming = mode.kind === "streaming";
  const isReady = mode.kind === "ready";
  const isAwaiting = mode.kind === "awaiting";
  const isError = mode.kind === "error";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-2xl">
        {/* Sticky header */}
        <DialogHeader className="shrink-0 border-b border-sand-200 px-6 pb-4 pt-6 text-left">
          <DialogTitle>Draft cold email</DialogTitle>
          <DialogDescription>
            To <span className="font-medium text-navy">{candidate.full_name}</span>{" "}
            &lt;{candidate.email}&gt; · for{" "}
            <span className="font-medium text-navy">{jdTitle}</span>
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable middle. flex-1 + overflow-y-auto keeps the body
            scrollable while the header + footer stay pinned. */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">

        {/* Model + Language pickers */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-deep">
              Model
            </label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value as ModelChoice)}
              disabled={streaming || sending}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
            >
              {MODEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] uppercase tracking-wide text-slate-deep">
              Language
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as LanguageChoice)}
              disabled={streaming || sending}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
            >
              {LANGUAGE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* History panel — only visible if there's history */}
        {pastEmails.length > 0 && (
          <div className="rounded-md border border-sand-200 bg-cream/40">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-navy hover:bg-cream/60"
            >
              <span>
                Past drafts &amp; sends{" "}
                <span className="font-mono text-[10px] text-slate-deep">
                  ({pastEmails.length})
                </span>
              </span>
              <span className="text-xs text-slate-deep">
                {showHistory ? "Hide ▴" : "Show ▾"}
              </span>
            </button>
            {showHistory && (
              <ul className="max-h-48 overflow-y-auto border-t border-sand-200">
                {pastEmails.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => handleLoadPast(p)}
                      className="flex w-full items-start justify-between gap-3 border-b border-sand-100 px-3 py-2 text-left text-xs hover:bg-cream/60"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <StatusChip status={p.status} />
                          <span className="truncate font-medium text-navy">
                            {p.subject || "(no subject)"}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-slate-deep">
                          {p.body_markdown.slice(0, 160)}
                          {p.body_markdown.length > 160 && "…"}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-slate-mid">
                        {new Date(p.created_at).toLocaleString("en-GB", {
                          timeZone: "Asia/Bangkok",
                          hour12: false,
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Main pane */}
        {isAwaiting && (
          <div className="space-y-3 rounded-md border border-dashed border-sand-200 bg-cream/40 p-5 text-center">
            <p className="text-sm text-charcoal">
              Pick a past draft above, or draft a fresh one with the current
              model + language.
            </p>
            <Button onClick={() => fireDraftStream(model, language)}>
              Draft a new email
            </Button>
          </div>
        )}

        {streaming && (
          <StreamingPane
            partialSubject={
              mode.kind === "streaming" ? mode.partialSubject : ""
            }
            partialBody={mode.kind === "streaming" ? mode.partialBody : ""}
            model={model}
          />
        )}

        {isReady && (
          <EditablePane
            subject={subject}
            setSubject={setSubject}
            body={body}
            setBody={setBody}
            rationale={rationale}
            sending={sending}
            signature={signature}
          />
        )}

        {isError && (
          <div className="rounded-md border border-danger/30 bg-danger/5 p-4">
            <p className="text-sm font-medium text-danger">Draft failed</p>
            <p className="mt-1 text-sm text-danger/90">
              {mode.kind === "error" ? mode.message : ""}
            </p>
          </div>
        )}

        </div>
        {/* /scrollable middle */}

        {/* Sticky footer */}
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-sand-200 bg-warm-white px-6 py-4 sm:flex-row sm:justify-end sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Cancel
          </Button>
          {(isReady || isError) && (
            <Button
              variant="outline"
              onClick={handleRegenerate}
              disabled={sending}
            >
              {isError ? "Try again" : "Regenerate"}
            </Button>
          )}
          {isReady && (
            <Button onClick={handleSend} disabled={sending}>
              {sending ? "Sending…" : "Send"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StreamingPane({
  partialSubject,
  partialBody,
  model,
}: {
  partialSubject: string;
  partialBody: string;
  model: ModelChoice;
}) {
  const hasAny = partialSubject.length > 0 || partialBody.length > 0;
  return (
    <div className="space-y-3 rounded-md border border-dashed border-sand-200 bg-cream/40 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-info" />
          <p className="text-sm font-medium text-navy">
            {model === "claude-opus-4-7" ? "Opus 4.7" : "Haiku 4.5"} is
            drafting…
          </p>
        </div>
      </div>
      {!hasAny ? (
        <p className="text-xs text-slate-mid">
          Waiting for the first token. Usually 2-4 seconds.
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-deep">
              Subject
            </p>
            <p className="rounded-sm bg-warm-white px-3 py-2 text-sm text-navy">
              {partialSubject || <span className="text-slate-mid">…</span>}
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
  signature,
}: {
  subject: string;
  setSubject: (s: string) => void;
  body: string;
  setBody: (s: string) => void;
  rationale: string;
  sending: boolean;
  signature: string | null;
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
          rows={10}
          maxLength={4000}
          disabled={sending}
          className="font-sans text-sm leading-relaxed"
        />
        <p className="mt-1 text-[10px] text-slate-mid">
          Edits stay client-side until you click Send.
        </p>
      </div>

      {/* Signature preview — read-only, appended at send time. Renders as
          HTML when the saved signature is HTML so the H+ logo block +
          divider preview accurately. Plain text falls back to <pre>. */}
      {signature ? (
        <div className="rounded-md border border-sand-200 bg-cream/40">
          <div className="flex items-center justify-between border-b border-sand-200 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-deep">
              Signature{" "}
              <span className="text-slate-mid normal-case">
                · appended automatically
              </span>
            </p>
            <Link
              href="/settings/email-composer"
              className="text-[11px] text-terracotta-700 underline-offset-2 hover:underline"
            >
              Edit →
            </Link>
          </div>
          {/<[a-z][a-z0-9]*(\s[^>]*)?>/i.test(signature) ? (
            <div className="bg-white px-3 py-3">
              {/* User's own saved HTML, rendered back to them. Trusted. */}
              <div dangerouslySetInnerHTML={{ __html: signature }} />
            </div>
          ) : (
            <pre className="whitespace-pre-wrap px-3 py-2 font-sans text-xs leading-relaxed text-charcoal">
              {signature}
            </pre>
          )}
        </div>
      ) : (
        <div className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-xs text-charcoal">
          <p>
            <strong>No signature configured.</strong> The email will go out
            with just the body. Set one up at{" "}
            <Link
              href="/settings/email-composer"
              className="text-terracotta-700 underline-offset-2 hover:underline"
            >
              Settings → Email composer
            </Link>
            .
          </p>
        </div>
      )}

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
    </div>
  );
}

function StatusChip({ status }: { status: PastEmail["status"] }) {
  const styles: Record<PastEmail["status"], string> = {
    drafted: "bg-sand-100 text-charcoal",
    sent: "bg-success/10 text-success",
    failed: "bg-danger/15 text-danger",
    discarded: "bg-warning/15 text-warning",
  };
  const label: Record<PastEmail["status"], string> = {
    drafted: "draft",
    sent: "sent",
    failed: "failed",
    discarded: "discarded",
  };
  return (
    <span
      className={`shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${styles[status]}`}
    >
      {label[status]}
    </span>
  );
}
