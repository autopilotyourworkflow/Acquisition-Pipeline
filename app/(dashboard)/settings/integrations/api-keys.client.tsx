"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  saveProxycurlKey,
  clearProxycurlKey,
  saveSerpapiKey,
  clearSerpapiKey,
} from "@/app/actions/integrations";

type KeyStatus = {
  proxycurlSaved: boolean;
  proxycurlUpdatedAt: string | null;
  serpapiSaved: boolean;
  serpapiUpdatedAt: string | null;
};

export function ApiKeysPanel({ status }: { status: KeyStatus }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-display text-xl text-navy">API keys</h2>
        <p className="mt-1 text-sm text-charcoal">
          Personal third-party API keys. Stored encrypted (AES-256-GCM) and
          never echoed back to you. Clear and re-paste to rotate.
        </p>
      </div>

      <KeyRow
        title="Proxycurl"
        description="LinkedIn profile scraping (Scraper → Third-party tab, and outbound sourcing on JDs)."
        saved={status.proxycurlSaved}
        updatedAt={status.proxycurlUpdatedAt}
        getKeyHref="https://nubela.co/proxycurl"
        onSave={(v) => saveProxycurlKey({ value: v })}
        onClear={() => clearProxycurlKey()}
      />

      <KeyRow
        title="SerpAPI (optional)"
        description="Google search backbone for JobsDB outbound sourcing. Without this, JobsDB falls back to direct Jina Reader and usually returns nothing."
        saved={status.serpapiSaved}
        updatedAt={status.serpapiUpdatedAt}
        getKeyHref="https://serpapi.com"
        onSave={(v) => saveSerpapiKey({ value: v })}
        onClear={() => clearSerpapiKey()}
      />
    </section>
  );
}

function KeyRow({
  title,
  description,
  saved,
  updatedAt,
  getKeyHref,
  onSave,
  onClear,
}: {
  title: string;
  description: string;
  saved: boolean;
  updatedAt: string | null;
  getKeyHref: string;
  onSave: (v: string) => Promise<{ ok: boolean; error?: string }>;
  onClear: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!value.trim()) {
      toast.error("Paste a key before saving");
      return;
    }
    startTransition(async () => {
      const r = await onSave(value);
      if (!r.ok) {
        toast.error("Couldn't save", { description: r.error });
        return;
      }
      toast.success(`${title} key saved`);
      setValue("");
      router.refresh();
    });
  }

  function clear() {
    if (!window.confirm(`Clear the saved ${title} key?`)) return;
    startTransition(async () => {
      const r = await onClear();
      if (!r.ok) {
        toast.error("Couldn't clear", { description: r.error });
        return;
      }
      toast.success(`${title} key cleared`);
      router.refresh();
    });
  }

  return (
    <div className="rounded-md border border-sand-200 bg-warm-white px-4 py-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
        <div>
          <p className="font-medium text-navy">{title}</p>
          <p className="mt-1 text-xs text-charcoal">{description}</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-deep">
          <a
            href={getKeyHref}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-terracotta"
          >
            Get a key ↗
          </a>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {saved ? (
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-success/10 px-2 py-1 text-xs font-medium text-success">
            <span aria-hidden>✓</span> Saved
            {updatedAt && (
              <span className="font-mono text-[10px] text-success/70">
                · {new Date(updatedAt).toLocaleString("en-GB", {
                  timeZone: "Asia/Bangkok",
                  hour12: false,
                })}
              </span>
            )}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-sand-200/40 px-2 py-1 text-xs font-medium text-slate-deep">
            Not configured
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={saved ? "Paste a new key to replace" : "Paste API key"}
          autoComplete="off"
          spellCheck={false}
          className="font-mono text-xs"
        />
        <div className="flex gap-2">
          <Button onClick={submit} disabled={pending || !value.trim()}>
            {pending ? "Saving…" : "Save"}
          </Button>
          {saved && (
            <Button
              variant="outline"
              onClick={clear}
              disabled={pending}
              className="text-danger"
            >
              Clear
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
