"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * Bookmarklet receiver page. The bookmarklet opens this page in a new tab
 * with `#d=<base64-payload>` in the URL hash. The hash contains the
 * source-page text, the user's bookmarklet token, and the source URL.
 *
 * Why this exists: most major sites (LinkedIn, JobsDB) ship a strict CSP
 * `connect-src` that blocks cross-origin fetch() from inline bookmarklet
 * code. By opening our own domain in a new tab, the POST to
 * /api/scrape/bookmarklet is same-origin and not subject to the source
 * page's CSP. The hash carries the data — hashes are never sent to the
 * server, so this won't appear in our access logs either.
 */

type Status = "decoding" | "sending" | "success" | "error";

type Payload = { t: string; text: string; url: string };

export default function BookmarkletCapturePage() {
  const [status, setStatus] = useState<Status>("decoding");
  const [message, setMessage] = useState("Decoding capture…");
  const [candidateId, setCandidateId] = useState<string | null>(null);
  const [candidateName, setCandidateName] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const rawHash = window.location.hash.slice(1);
        if (!rawHash) {
          setStatus("error");
          setMessage("Missing capture payload in URL hash.");
          return;
        }
        const params = new URLSearchParams(rawHash);
        const encoded = params.get("d");
        if (!encoded) {
          setStatus("error");
          setMessage('Missing "d" parameter in URL hash.');
          return;
        }

        // URL-safe base64 → bytes → utf-8 string → JSON.
        const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
        const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
        const bin = atob(padded);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const json = new TextDecoder().decode(bytes);
        const payload = JSON.parse(json) as Payload;
        if (!payload?.t || !payload?.text) {
          setStatus("error");
          setMessage("Invalid capture payload shape.");
          return;
        }

        setStatus("sending");
        setMessage("Sending to Acquisition…");

        const res = await fetch("/api/scrape/bookmarklet", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + payload.t,
          },
          body: JSON.stringify({
            text: payload.text,
            sourceUrl: payload.url,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          candidateId?: string;
          full_name?: string;
          source?: string;
          error?: string;
        };

        if (!res.ok || !data.ok) {
          setStatus("error");
          setMessage(data.error || `Server returned ${res.status}.`);
          return;
        }

        setStatus("success");
        setCandidateId(data.candidateId ?? null);
        setCandidateName(data.full_name ?? "Candidate");
        setMessage(
          `Added: ${data.full_name ?? "candidate"}${
            data.source ? ` (source: ${data.source})` : ""
          }`,
        );

        // Clear the hash so the payload isn't preserved if the user
        // navigates back to this tab later.
        history.replaceState(null, "", window.location.pathname);
      } catch (err) {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Unknown error");
      }
    })();
  }, []);

  const isError = status === "error";
  const isDone = status === "success" || status === "error";

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-6">
      <div className="w-full max-w-md rounded-lg border border-soft-gray bg-white p-8 text-center shadow-sm">
        <div
          className={`mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full ${
            status === "success"
              ? "bg-success/10 text-success"
              : isError
                ? "bg-danger/10 text-danger"
                : "bg-yellow/10 text-black"
          }`}
        >
          {status === "success" ? (
            <span className="text-2xl" aria-hidden>
              ✓
            </span>
          ) : isError ? (
            <span className="text-2xl" aria-hidden>
              ✕
            </span>
          ) : (
            <span className="block h-3 w-3 animate-pulse rounded-full bg-yellow" />
          )}
        </div>

        <h1 className="font-display text-2xl font-medium text-black">
          {status === "success"
            ? "Candidate captured"
            : isError
              ? "Capture failed"
              : "Capturing candidate…"}
        </h1>
        <p className="mt-2 text-sm text-black">{message}</p>

        {isDone && (
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {candidateId && (
              <Button asChild>
                <Link href={`/candidates/${candidateId}`}>
                  View {candidateName}
                </Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/tracker">Open tracker</Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => window.close()}
              className="text-black"
            >
              Close tab
            </Button>
          </div>
        )}

        {isError && (
          <p className="mt-4 text-[11px] text-gray">
            If this keeps failing, the source page&apos;s text may not look
            like a candidate profile. Fall back to{" "}
            <Link
              href="/scraper"
              className="underline underline-offset-2 hover:text-black"
            >
              Scraper → Paste
            </Link>{" "}
            and paste the rendered text manually.
          </p>
        )}
      </div>
    </div>
  );
}
