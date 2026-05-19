"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { createCandidate } from "@/app/actions/candidates";
import type { CandidateSource } from "@/lib/db/enums";
import type { ExtractCandidateInput } from "@/lib/anthropic/tools/extract_candidate";

type ScraperTab = "paste" | "url" | "pdf" | "screenshot" | "thirdparty";
type ExtractState =
  | { status: "idle" }
  | { status: "loading"; stage: string }
  | { status: "complete"; data: ExtractCandidateInput }
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
  parsing_pdf: "Reading PDF…",
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
  const [selectedJdId, setSelectedJdId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleExtract = async (endpoint: string, body: Record<string, unknown> | FormData) => {
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
        setExtractState({ status: "complete", data });
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

  const handleSave = async () => {
    if (extractState.status !== "complete") return;

    setIsSaving(true);
    try {
      const sourceMap: Record<ScraperTab, CandidateSource> = {
        paste: "paste",
        url: "linkedin", // or jobsdb depending on user input
        pdf: "pdf",
        screenshot: "screenshot",
        thirdparty: "thirdparty_api",
      };

      const result = await createCandidate({
        full_name: extractState.data.full_name,
        email: extractState.data.email,
        phone: extractState.data.phone,
        current_title: extractState.data.current_title,
        location: extractState.data.location,
        linkedin_url: extractState.data.linkedin_url,
        source_url: extractState.data.source_url,
        source: sourceMap[activeTab],
        jd_id: selectedJdId,
        raw_profile: extractState.data,
      });

      if (result.ok) {
        // Reset form and show success toast
        setExtractState({ status: "idle" });
        setSelectedJdId(null);
        // Toast would be shown by the parent or via sonner
      } else {
        setExtractState({ status: "error", message: result.error });
      }
    } finally {
      setIsSaving(false);
    }
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
      </Tabs>

      {extractState.status === "complete" && (
        <PreviewPanel
          data={extractState.data}
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

      {extractState.status === "error" && (
        <div className="rounded-lg border border-danger/30 bg-danger/5 p-4 text-sm">
          <p className="font-medium text-danger">Couldn&apos;t extract candidate</p>
          <p className="mt-1 text-danger/90">{extractState.message}</p>
        </div>
      )}
    </div>
  );
}

function PasteTab({ onExtract }: { onExtract: (endpoint: string, body: Record<string, unknown> | FormData) => Promise<void> }) {
  const [text, setText] = useState("");

  return (
    <>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste resume or profile text here..."
        className="w-full h-64 rounded-lg border border-gray-300 p-3 font-mono text-sm"
      />
      <Button
        onClick={() => onExtract("/api/scrape/paste", { text })}
        disabled={!text.trim()}
      >
        Extract
      </Button>
    </>
  );
}

function UrlTab({ onExtract }: { onExtract: (endpoint: string, body: Record<string, unknown> | FormData) => Promise<void> }) {
  const [url, setUrl] = useState("");

  return (
    <>
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Enter LinkedIn profile or job URL..."
        className="w-full rounded-lg border border-gray-300 px-3 py-2"
      />
      <Button
        onClick={() => onExtract("/api/scrape/url", { url })}
        disabled={!url.trim()}
      >
        Fetch & Extract
      </Button>
    </>
  );
}

function PdfTab({ onExtract }: { onExtract: (endpoint: string, body: Record<string, unknown> | FormData) => Promise<void> }) {
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    await onExtract("/api/scrape/pdf", formData as any);
  };

  return (
    <>
      <input
        type="file"
        accept=".pdf"
        onChange={handleFileChange}
        className="w-full rounded-lg border border-gray-300 px-3 py-2"
      />
      <p className="text-xs text-gray-500">PDF files up to 8MB</p>
    </>
  );
}

function ScreenshotTab({ onExtract }: { onExtract: (endpoint: string, body: Record<string, unknown> | FormData) => Promise<void> }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
      <p className="text-sm text-gray-600">Screenshot extraction coming soon</p>
    </div>
  );
}

function ThirdPartyTab({ onExtract }: { onExtract: (endpoint: string, body: Record<string, unknown> | FormData) => Promise<void> }) {
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  return (
    <div className="space-y-4">
      <input
        type="url"
        value={linkedinUrl}
        onChange={(e) => setLinkedinUrl(e.target.value)}
        placeholder="LinkedIn profile URL..."
        className="w-full rounded-lg border border-gray-300 px-3 py-2"
      />
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="Proxycurl API key (optional, uses default if configured)..."
        className="w-full rounded-lg border border-gray-300 px-3 py-2"
      />
      <Button
        onClick={() => onExtract("/api/scrape/thirdparty", { linkedinUrl, apiKey: apiKey || undefined })}
        disabled={!linkedinUrl.trim()}
      >
        Fetch Profile
      </Button>
      <p className="text-xs text-gray-500">
        Uses Proxycurl API. Set your API key in Settings → Integrations for auto-use.
      </p>
    </div>
  );
}

function PreviewPanel({
  data,
  jds,
  selectedJdId,
  onJdChange,
  onSave,
  isSaving,
}: {
  data: ExtractCandidateInput;
  jds: Array<{ id: string; title: string }>;
  selectedJdId: string | null;
  onJdChange: (id: string | null) => void;
  onSave: () => Promise<void>;
  isSaving: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
      <h2 className="text-lg font-semibold text-navy">Preview & Confirm</h2>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700">Full Name</label>
          <input type="text" value={data.full_name} className="w-full rounded border border-gray-300 px-2 py-1" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">Email</label>
          <input type="email" value={data.email || ""} className="w-full rounded border border-gray-300 px-2 py-1" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">Phone</label>
          <input type="tel" value={data.phone || ""} className="w-full rounded border border-gray-300 px-2 py-1" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700">Title</label>
          <input type="text" value={data.current_title || ""} className="w-full rounded border border-gray-300 px-2 py-1" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700">Job Description (optional)</label>
        <select
          value={selectedJdId || ""}
          onChange={(e) => onJdChange(e.target.value || null)}
          className="w-full rounded border border-gray-300 px-2 py-1"
        >
          <option value="">-- No JD --</option>
          {jds.map((jd) => (
            <option key={jd.id} value={jd.id}>
              {jd.title}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2">
        <Button onClick={onSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Candidate"}
        </Button>
      </div>
    </div>
  );
}
