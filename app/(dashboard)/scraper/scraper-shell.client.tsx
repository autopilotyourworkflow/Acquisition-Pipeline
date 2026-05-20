"use client";

import { useState } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { createCandidate } from "@/app/actions/candidates";
import type { CandidateSource } from "@/lib/db/enums";
import type { ExtractCandidateInput } from "@/lib/anthropic/tools/extract_candidate";

type ScraperTab = "paste" | "url" | "pdf" | "screenshot" | "thirdparty" | "jobsdb";

/**
 * The original input the user provided, stashed alongside the extracted
 * candidate so we can persist it into `raw_profile.scraper_source` and
 * surface the source content on the candidate detail page later.
 */
type ScraperSource =
  | { kind: "paste"; text: string }
  | { kind: "url"; url: string }
  | { kind: "pdf"; filename: string; size: number }
  | { kind: "screenshot"; filename: string }
  | { kind: "thirdparty"; linkedinUrl: string }
  | { kind: "jobsdb"; url?: string; pasted?: string };

type ExtractState =
  | { status: "idle" }
  | { status: "loading"; stage: string }
  | {
      status: "complete";
      data: ExtractCandidateInput;
      /**
       * Set by the PDF route when it uploaded the binary + created an orphan
       * attachment row. Passed through to createCandidate on save so we can
       * claim that attachment for the new candidate.
       */
      attachmentId?: string | null;
    }
  | { status: "saved"; name: string; candidateId: string }
  | { status: "error"; message: string };

/**
 * Map server-side progress status keys to human-readable labels.
 * Each scrape endpoint emits `scrape_progress { status: "..." }` events;
 * we translate those keys here so the UI shows what's actually happening
 * (raw keys like "parsing_pdf" leak implementation details).
 */
const STATUS_LABELS: Record<string, string> = {
  fetching: "Fetching URL…",
  parsing: "Parsing page content…",
  fallback_jina: "Direct fetch was thin — trying Jina Reader fallback…",
  parsing_pdf: "Reading PDF…",
  storing_pdf: "Saving PDF to storage…",
  normalizing: "Calling Claude (Haiku) — extracting candidate info…",
  thirdparty_fetch: "Calling Proxycurl…",
  vision: "Calling Claude (Opus vision) — reading screenshot…",
};

interface ScraperShellProps {
  initialJds: Array<{ id: string; title: string }>;
}

export function ScraperShell({ initialJds }: ScraperShellProps) {
  const [activeTab, setActiveTab] = useState<ScraperTab>("paste");
  const [extractState, setExtractState] = useState<ExtractState>({ status: "idle" });
  const [originalSource, setOriginalSource] = useState<ScraperSource | null>(null);
  const [selectedJdId, setSelectedJdId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleExtract = async (
    endpoint: string,
    body: Record<string, unknown> | FormData,
    source: ScraperSource,
  ) => {
    setOriginalSource(source);
    setExtractState({ status: "loading", stage: "Connecting…" });

    try {
      const isFormData = body instanceof FormData;
      const response = await fetch(endpoint, {
        method: "POST",
        ...(isFormData
          ? { body }
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
      });

      if (!response.ok) {
        const error = await response.json();
        setExtractState({ status: "error", message: error.error || "Extraction failed" });
        return;
      }

      const reader = response.body?.pipeThrough(new TextDecoderStream()).getReader();
      if (!reader) throw new Error("No response stream");

      let data: ExtractCandidateInput | null = null;
      let attachmentId: string | null = null;
      let buffer = "";
      let errored = false;

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

          let payload: any;
          try {
            payload = JSON.parse(dataLines.join("\n"));
          } catch {
            continue;
          }

          if (event === "scrape_complete" && payload?.candidate) {
            data = payload.candidate;
            if (typeof payload.attachmentId === "string") {
              attachmentId = payload.attachmentId;
            }
          } else if (event === "scrape_progress" && payload?.status) {
            const label = STATUS_LABELS[payload.status] || payload.status;
            setExtractState({ status: "loading", stage: label });
          } else if (event === "scrape_error") {
            setExtractState({
              status: "error",
              message: payload?.message || "Extraction failed",
            });
            errored = true;
            break;
          }
        }
        if (errored) break;
      }

      if (errored) return;

      if (data) {
        setExtractState({ status: "complete", data, attachmentId });
      } else {
        setExtractState({
          status: "error",
          message: "Stream closed without a candidate result. Please try again or report the issue.",
        });
      }
    } catch (err) {
      setExtractState({
        status: "error",
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  };

  const handleSave = async (draft: ExtractCandidateInput) => {
    if (extractState.status !== "complete") return;

    setIsSaving(true);
    try {
      const sourceMap: Record<ScraperTab, CandidateSource> = {
        paste: "paste",
        url: "linkedin", // or jobsdb depending on user input
        pdf: "pdf",
        screenshot: "screenshot",
        thirdparty: "thirdparty_api",
        jobsdb: "jobsdb",
      };

      // Persist the original source content alongside the extracted candidate
      // so the detail page can show where this came from later.
      const rawProfileWithSource = {
        ...draft,
        scraper_source: originalSource ?? null,
      };

      const attachmentId =
        extractState.status === "complete" ? extractState.attachmentId ?? null : null;

      const result = await createCandidate({
        full_name: draft.full_name,
        email: draft.email,
        phone: draft.phone,
        current_title: draft.current_title,
        location: draft.location,
        linkedin_url: draft.linkedin_url,
        source_url: draft.source_url,
        source: sourceMap[activeTab],
        jd_id: selectedJdId,
        raw_profile: rawProfileWithSource,
        attachmentId,
      });

      if (result.ok) {
        setExtractState({
          status: "saved",
          name: draft.full_name,
          candidateId: result.data.id,
        });
      } else {
        setExtractState({ status: "error", message: result.error });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const resetForAnother = () => {
    setExtractState({ status: "idle" });
    setOriginalSource(null);
    setSelectedJdId(null);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-display font-bold text-navy">Add Candidates</h1>
        <p className="text-sm text-gray-600">Import candidates from multiple sources</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ScraperTab)}>
        <TabsList>
          <TabsTrigger value="paste">Paste</TabsTrigger>
          <TabsTrigger value="url">URL</TabsTrigger>
          <TabsTrigger value="pdf">PDF</TabsTrigger>
          <TabsTrigger value="screenshot">Screenshot</TabsTrigger>
          <TabsTrigger value="thirdparty">Third-party API</TabsTrigger>
          <TabsTrigger value="jobsdb">JobsDB</TabsTrigger>
        </TabsList>

        <TabsContent value="paste" className="space-y-4">
          <PasteTab onExtract={handleExtract} />
        </TabsContent>

        <TabsContent value="url" className="space-y-4">
          <UrlTab onExtract={handleExtract} />
        </TabsContent>

        <TabsContent value="pdf" className="space-y-4">
          <PdfTab onExtract={handleExtract} />
        </TabsContent>

        <TabsContent value="screenshot" className="space-y-4">
          <ScreenshotTab onExtract={handleExtract} />
        </TabsContent>

        <TabsContent value="thirdparty" className="space-y-4">
          <ThirdPartyTab onExtract={handleExtract} />
        </TabsContent>

        <TabsContent value="jobsdb" className="space-y-4">
          <JobsDbTab onExtract={handleExtract} />
        </TabsContent>
      </Tabs>

      {extractState.status === "complete" && (
        <PreviewPanel
          key={extractState.data.full_name + (extractState.data.email ?? "")}
          initialData={extractState.data}
          jds={initialJds}
          selectedJdId={selectedJdId}
          onJdChange={setSelectedJdId}
          onSave={handleSave}
          isSaving={isSaving}
        />
      )}

      {extractState.status === "loading" && (
        <div className="flex items-center gap-3 rounded-lg border border-sand-200 bg-cream/40 p-4 text-sm text-charcoal">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-terracotta" />
          <span>{extractState.stage}</span>
        </div>
      )}

      {extractState.status === "saved" && (
        <div className="rounded-lg border border-success/30 bg-success/5 p-5">
          <p className="font-display text-lg text-navy">
            Saved: <span className="font-medium">{extractState.name}</span>
          </p>
          <p className="mt-1 text-sm text-charcoal/80">
            Candidate added to the tracker. The original source is preserved on
            their detail page.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/candidates/${extractState.candidateId}`}>
                View candidate
              </Link>
            </Button>
            <Button variant="outline" onClick={resetForAnother}>
              Scrape another
            </Button>
          </div>
        </div>
      )}

      {extractState.status === "error" && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm">
          <p className="font-medium text-danger">Couldn&apos;t extract candidate</p>
          <p className="mt-1 text-danger/90">{extractState.message}</p>
        </div>
      )}
    </div>
  );
}

type ExtractFn = (
  endpoint: string,
  body: Record<string, unknown> | FormData,
  source: ScraperSource,
) => Promise<void>;

function PasteTab({ onExtract }: { onExtract: ExtractFn }) {
  const [text, setText] = useState("");

  return (
    <>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste resume or profile text here..."
        className="w-full h-64 rounded-lg border border-sand-200 bg-warm-white p-3 font-mono text-sm"
      />
      <Button
        onClick={() => onExtract("/api/scrape/paste", { text }, { kind: "paste", text })}
        disabled={!text.trim()}
      >
        Extract
      </Button>
    </>
  );
}

function UrlTab({ onExtract }: { onExtract: ExtractFn }) {
  const [url, setUrl] = useState("");

  const handleSubmit = () => {
    // Server route does this too, but trimming client-side gives nicer
    // feedback (the URL bar reflects what was actually sent).
    const cleaned = url.trim().replace(/^['"“”‘’]+|['"“”‘’]+$/g, "").trim();
    onExtract("/api/scrape/url", { url: cleaned }, { kind: "url", url: cleaned });
  };

  return (
    <>
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Paste any profile, bio, or article URL…"
        className="w-full rounded-lg border border-sand-200 bg-warm-white px-3 py-2"
      />
      <Button onClick={handleSubmit} disabled={!url.trim()}>
        Fetch &amp; Extract
      </Button>
      <p className="text-xs text-slate-mid">
        Works on most public pages. If a site blocks direct access (LinkedIn,
        paywalled sites), we fall back to Jina Reader automatically.
      </p>
    </>
  );
}

function PdfTab({ onExtract }: { onExtract: ExtractFn }) {
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    await onExtract("/api/scrape/pdf", formData, {
      kind: "pdf",
      filename: file.name,
      size: file.size,
    });
  };

  return (
    <>
      <input
        type="file"
        accept=".pdf"
        onChange={handleFileChange}
        className="w-full rounded-lg border border-sand-200 bg-warm-white px-3 py-2"
      />
      <p className="text-xs text-slate-mid">PDF files up to 8MB</p>
    </>
  );
}

function ScreenshotTab({ onExtract: _onExtract }: { onExtract: ExtractFn }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-sand-200 p-8 text-center">
      <p className="text-sm text-slate-deep">Screenshot extraction coming soon</p>
    </div>
  );
}

function ThirdPartyTab({ onExtract }: { onExtract: ExtractFn }) {
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  return (
    <div className="space-y-4">
      <input
        type="url"
        value={linkedinUrl}
        onChange={(e) => setLinkedinUrl(e.target.value)}
        placeholder="LinkedIn profile URL..."
        className="w-full rounded-lg border border-sand-200 bg-warm-white px-3 py-2"
      />
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="Proxycurl API key (optional, uses default if configured)..."
        className="w-full rounded-lg border border-sand-200 bg-warm-white px-3 py-2"
      />
      <Button
        onClick={() =>
          onExtract(
            "/api/scrape/thirdparty",
            { linkedinUrl, apiKey: apiKey || undefined },
            { kind: "thirdparty", linkedinUrl },
          )
        }
        disabled={!linkedinUrl.trim()}
      >
        Fetch Profile
      </Button>
      <p className="text-xs text-slate-mid">
        Uses Proxycurl API. Set your API key in Settings → Integrations for auto-use.
      </p>
    </div>
  );
}

function JobsDbTab({ onExtract }: { onExtract: ExtractFn }) {
  const [url, setUrl] = useState("");
  const [pasted, setPasted] = useState("");

  const canSubmit = url.trim().length > 0 || pasted.trim().length > 0;

  const handleSubmit = () => {
    const cleanedUrl = url.trim().replace(/^['"“”‘’]+|['"“”‘’]+$/g, "").trim();
    if (cleanedUrl) {
      onExtract(
        "/api/scrape/url",
        { url: cleanedUrl },
        { kind: "jobsdb", url: cleanedUrl },
      );
      return;
    }
    // Paste fallback for login-walled JobsDB pages — prepend a hint so the
    // normalizer treats the dump as a candidate profile rather than a job
    // listing.
    const hintedText =
      "Source: JobsDB candidate / application page.\n\n" + pasted.trim();
    onExtract(
      "/api/scrape/paste",
      { text: hintedText },
      { kind: "jobsdb", pasted: pasted.trim() },
    );
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-sand-200 bg-cream/40 px-3 py-2 text-xs text-charcoal">
        Paste a JobsDB candidate / application URL. If the page is behind a
        login wall, paste the page text in the second box instead — we&apos;ll
        normalize it the same way.
      </div>
      <input
        type="text"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://hk.jobsdb.com/…"
        className="w-full rounded-lg border border-sand-200 bg-warm-white px-3 py-2"
      />
      <textarea
        value={pasted}
        onChange={(e) => setPasted(e.target.value)}
        placeholder="…or paste the page text here (for login-walled pages)"
        className="w-full h-40 rounded-lg border border-sand-200 bg-warm-white p-3 font-mono text-sm"
      />
      <Button onClick={handleSubmit} disabled={!canSubmit}>
        Fetch &amp; Extract
      </Button>
      <p className="text-xs text-slate-mid">
        The candidate will be saved with{" "}
        <span className="font-mono">source: jobsdb</span>.
      </p>
    </div>
  );
}

function PreviewPanel({
  initialData,
  jds,
  selectedJdId,
  onJdChange,
  onSave,
  isSaving,
}: {
  initialData: ExtractCandidateInput;
  jds: Array<{ id: string; title: string }>;
  selectedJdId: string | null;
  onJdChange: (id: string | null) => void;
  onSave: (draft: ExtractCandidateInput) => Promise<void>;
  isSaving: boolean;
}) {
  const [draft, setDraft] = useState<ExtractCandidateInput>(initialData);
  const [skillsText, setSkillsText] = useState<string>(initialData.skills.join(", "));

  const update = <K extends keyof ExtractCandidateInput>(
    field: K,
    value: ExtractCandidateInput[K],
  ) => {
    setDraft((d) => ({ ...d, [field]: value }));
  };

  const handleSkillsChange = (text: string) => {
    setSkillsText(text);
    const arr = text
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    update("skills", arr);
  };

  const canSave = draft.full_name.trim().length > 0;

  return (
    <div className="space-y-4 rounded-lg border border-sand-200 bg-warm-white p-6">
      <div>
        <h2 className="font-display text-lg text-navy">Preview &amp; confirm</h2>
        <p className="mt-1 text-xs text-slate-deep">
          Edit anything that looks wrong before saving. Skills are
          comma-separated.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Full name *">
          <input
            type="text"
            required
            value={draft.full_name}
            onChange={(e) => update("full_name", e.target.value)}
            className={fieldCls}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={draft.email ?? ""}
            onChange={(e) => update("email", e.target.value || null)}
            className={fieldCls}
          />
        </Field>
        <Field label="Phone">
          <input
            type="tel"
            value={draft.phone ?? ""}
            onChange={(e) => update("phone", e.target.value || null)}
            className={fieldCls}
          />
        </Field>
        <Field label="Current title">
          <input
            type="text"
            value={draft.current_title ?? ""}
            onChange={(e) => update("current_title", e.target.value || null)}
            className={fieldCls}
          />
        </Field>
        <Field label="Location">
          <input
            type="text"
            value={draft.location ?? ""}
            onChange={(e) => update("location", e.target.value || null)}
            className={fieldCls}
          />
        </Field>
        <Field label="LinkedIn URL">
          <input
            type="url"
            value={draft.linkedin_url ?? ""}
            onChange={(e) => update("linkedin_url", e.target.value || null)}
            className={fieldCls}
          />
        </Field>
        <Field label="Source URL" className="md:col-span-2">
          <input
            type="url"
            value={draft.source_url ?? ""}
            onChange={(e) => update("source_url", e.target.value || null)}
            className={fieldCls}
          />
        </Field>
      </div>

      <Field label="Skills (comma-separated)">
        <textarea
          value={skillsText}
          onChange={(e) => handleSkillsChange(e.target.value)}
          rows={2}
          className={`${fieldCls} font-mono`}
        />
      </Field>

      {(draft.experience.length > 0 || draft.education.length > 0) && (
        <details className="rounded-md border border-sand-200 bg-cream/40 p-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-deep">
            Experience &amp; education extracted ({draft.experience.length} role
            {draft.experience.length === 1 ? "" : "s"},{" "}
            {draft.education.length} school
            {draft.education.length === 1 ? "" : "s"}) — read-only
          </summary>
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-warm-white p-3 font-mono text-[11px] text-charcoal">
            {JSON.stringify(
              { experience: draft.experience, education: draft.education },
              null,
              2,
            )}
          </pre>
        </details>
      )}

      <Field label="Job description (optional)">
        <select
          value={selectedJdId ?? ""}
          onChange={(e) => onJdChange(e.target.value || null)}
          className={fieldCls}
        >
          <option value="">-- No JD --</option>
          {jds.map((jd) => (
            <option key={jd.id} value={jd.id}>
              {jd.title}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex gap-2 pt-2">
        <Button onClick={() => onSave(draft)} disabled={isSaving || !canSave}>
          {isSaving ? "Saving…" : "Save candidate"}
        </Button>
        {!canSave && (
          <p className="self-center text-xs text-danger">
            Full name is required.
          </p>
        )}
      </div>
    </div>
  );
}

const fieldCls =
  "w-full rounded-md border border-sand-200 bg-warm-white px-3 py-1.5 text-sm text-navy focus:border-terracotta focus:outline-none";

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium uppercase tracking-wider text-slate-deep">
        {label}
      </label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
