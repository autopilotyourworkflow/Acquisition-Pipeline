import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { normalizeCandidate } from "@/lib/scrape/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ScrapeUrlRequest {
  url: string;
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Normalize a user-supplied URL string. Real-world input is messy: surrounding
 * quotes from copy-paste, missing protocol, trailing whitespace. We bend over
 * backwards here so a user typing the URL "wrong" still works.
 */
function normalizeUrl(input: string): { url: string } | { error: string } {
  let s = (input ?? "").trim();
  if (!s) return { error: "URL is empty" };

  // Strip surrounding straight + smart quotes (common copy-paste artifacts).
  const QUOTES = new Set(["\"", "'", "“", "”", "‘", "’"]);
  while (s.length >= 2 && QUOTES.has(s[0]!) && QUOTES.has(s[s.length - 1]!)) {
    s = s.slice(1, -1).trim();
  }

  // Auto-prepend https:// when the protocol is missing entirely. Don't try to
  // be smart about http vs https — modern sites that matter all support TLS.
  if (!/^https?:\/\//i.test(s)) {
    s = `https://${s}`;
  }

  try {
    const u = new URL(s);
    if (!u.hostname || !u.hostname.includes(".")) {
      return { error: "URL hostname looks invalid (no dot)" };
    }
    return { url: u.toString() };
  } catch {
    return { error: "Invalid URL syntax" };
  }
}

const FETCH_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * Pull the main-content text out of an HTML document. Tries semantic
 * containers (<article>, <main>) before falling back to <body>, and strips
 * navigation chrome so the LLM doesn't waste tokens on it.
 */
function extractMainContent(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, nav, footer, header, aside, noscript, iframe, form").remove();
  const article = $("article").first().text().trim();
  if (article.length > 200) return article;
  const main = $("main").first().text().trim();
  if (main.length > 200) return main;
  return $("body").text().trim();
}

/**
 * Last-resort fallback for sites that block server-side fetches or only
 * render content client-side. Jina Reader (https://r.jina.ai) returns a
 * clean markdown view of any URL. No API key required; rate-limited but
 * fine for a tool like this. Adds latency, so we only use it when our
 * primary path failed or yielded too little content.
 */
async function fetchViaJina(originalUrl: string): Promise<string> {
  const proxied = `https://r.jina.ai/${originalUrl}`;
  const response = await fetch(proxied, {
    headers: {
      "User-Agent": FETCH_HEADERS["User-Agent"]!,
      // X-Return-Format=text gives us plain text instead of markdown — easier
      // for the LLM downstream.
      "X-Return-Format": "text",
    },
  });
  if (!response.ok) {
    throw new Error(`Jina Reader returned ${response.status}`);
  }
  return await response.text();
}

function httpStatusHint(status: number): string {
  if (status === 401 || status === 403) {
    return `${status} — the site requires login or blocks automated access. Try a different URL.`;
  }
  if (status === 404) return "404 — page not found";
  if (status === 429) return "429 — rate limited by the site";
  if (status >= 500) return `${status} — the site itself is having problems`;
  return `${status}`;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ScrapeUrlRequest;
    const normalized = normalizeUrl(body?.url ?? "");
    if ("error" in normalized) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }
    const url = normalized.url;

    const encoder = new TextEncoder();
    const responseStream = new ReadableStream({
      async start(controller) {
        const emit = (event: string, data: unknown) =>
          controller.enqueue(encoder.encode(sseEvent(event, data)));

        try {
          emit("scrape_progress", { status: "fetching", url });

          let pageText = "";
          let usedFallback = false;
          let primaryError: string | null = null;

          // Primary: direct fetch + cheerio.
          try {
            const fetchController = new AbortController();
            const timeout = setTimeout(() => fetchController.abort(), 12000);
            const response = await fetch(url, {
              headers: FETCH_HEADERS,
              signal: fetchController.signal,
              redirect: "follow",
            });
            clearTimeout(timeout);

            if (!response.ok) {
              primaryError = `direct fetch failed: ${httpStatusHint(response.status)}`;
            } else {
              const html = await response.text();
              emit("scrape_progress", { status: "parsing" });
              pageText = extractMainContent(html);
              if (pageText.length < 200) {
                primaryError = `direct fetch returned only ${pageText.length} chars of text (page likely JS-rendered)`;
              }
            }
          } catch (err) {
            primaryError = err instanceof Error ? err.message : "fetch failed";
          }

          // Fallback: Jina Reader. Only kick in if the primary path gave us
          // too little to work with.
          if (!pageText || pageText.length < 200) {
            emit("scrape_progress", { status: "fallback_jina" });
            try {
              pageText = await fetchViaJina(url);
              usedFallback = true;
            } catch (err) {
              const msg = err instanceof Error ? err.message : "fallback failed";
              throw new Error(
                `Couldn't read this URL. ${primaryError ?? ""} Fallback also failed: ${msg}`,
              );
            }
          }

          if (!pageText.trim()) {
            throw new Error("No readable text found at this URL.");
          }

          emit("scrape_progress", {
            status: "normalizing",
            contentLength: pageText.length,
          });

          const candidate = await normalizeCandidate({
            text: pageText,
            model: "haiku",
          });

          // Stamp the source_url so it survives even if Claude missed it.
          if (!candidate.source_url) {
            candidate.source_url = url;
          }

          emit("scrape_complete", {
            candidate,
            sourceUrl: url,
            usedFallback,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          emit("scrape_error", { message });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(responseStream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 400 },
    );
  }
}
