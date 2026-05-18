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

interface ScraperShellProps {
  initialJds: Array<{ id: string; title: string }>;
}

export function ScraperShell({ initialJds }: ScraperShellProps) {
  const [activeTab, setActiveTab] = useState<ScraperTab>("paste");
  const [extractState, setExtractState] = useState<ExtractState>({ status: "idle" });
  const [selectedJdId, setSelectedJdId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleExtract = async (endpoint: string, body: Record<string, unknown> | FormData) => {
    setExtractState({ status: "loading", stage: "Initializing..." });

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

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let data: ExtractCandidateInput | null = null;
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6);
            try {
              const msg = JSON.parse(jsonStr);
              if (msg.event === "scrape_complete" && msg.data?.candidate) {
                data = msg.data.candidate;
              } else if (msg.event === "scrape_progress" && msg.data?.status) {
                setExtractState({
                  status: "loading",
                  stage: msg.data.status,
                });
              } else if (msg.event === "scrape_error") {
                setExtractState({
                  status: "error",
                  message: msg.data?.message || "Extraction failed",
                });
                return;
              }
            } catch {
              // Ignore JSON parse errors
            }
          }
        }
      }

      if (buffer.trim().startsWith("data: ")) {
        try {
          const msg = JSON.parse(buffer.slice(6));
          if (msg.event === "scrape_complete" && msg.data?.candidate) {
            data = msg.data.candidate;
          }
        } catch {
          // Ignore
        }
      }

      if (data) {
        setExtractState({ status: "complete", data });
      } else {
        setExtractState({ status: "error", message: "No candidate data extracted" });
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
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-600">
          {extractState.stage}
        </div>
      )}

      {extractState.status === "error" && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {extractState.message}
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
