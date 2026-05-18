import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { normalizeCandidate } from "@/lib/scrape/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ScrapeUrlRequest {
  url: string;
}

interface ScrapeEvent {
  event: string;
  data: unknown;
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  try {
    const { url } = (await req.json()) as ScrapeUrlRequest;

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const responseStream = new ReadableStream({
      async start(controller) {
        const emit = (event: string, data: unknown) =>
          controller.enqueue(encoder.encode(sseEvent(event, data)));

        try {
          emit("scrape_progress", { status: "fetching", url });

          // Fetch the URL with a reasonable timeout
          const fetchController = new AbortController();
          const timeout = setTimeout(() => fetchController.abort(), 10000);

          let html: string;
          try {
            const response = await fetch(url, {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
              },
              signal: fetchController.signal,
            });
            clearTimeout(timeout);

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            html = await response.text();
          } catch (fetchErr) {
            clearTimeout(timeout);
            throw new Error(`Failed to fetch URL: ${fetchErr instanceof Error ? fetchErr.message : "Unknown error"}`);
          }

          emit("scrape_progress", { status: "parsing" });

          // Parse HTML and extract text content
          const $ = cheerio.load(html);

          // Remove script and style elements
          $("script, style").remove();

          // Extract text from the body
          const bodyText = $("body").text();

          if (!bodyText.trim()) {
            throw new Error("No text content found in the page");
          }

          emit("scrape_progress", { status: "normalizing", contentLength: bodyText.length });

          // Normalize the text through Claude
          const candidate = await normalizeCandidate({
            text: bodyText,
            model: "haiku",
          });

          emit("scrape_complete", {
            candidate,
            sourceUrl: url,
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
