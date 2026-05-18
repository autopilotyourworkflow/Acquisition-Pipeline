import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { normalizeCandidate } from "@/lib/scrape/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "PDF file is required" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 8MB)" }, { status: 413 });
    }

    const encoder = new TextEncoder();
    const responseStream = new ReadableStream({
      async start(controller) {
        const emit = (event: string, data: unknown) =>
          controller.enqueue(encoder.encode(sseEvent(event, data)));

        try {
          emit("scrape_progress", { status: "parsing_pdf", fileName: file.name });

          // Parse PDF
          const buf = new Uint8Array(await file.arrayBuffer());
          let parsedText = "";

          try {
            const pdf = await getDocumentProxy(buf);
            const result = await extractText(pdf, { mergePages: true });
            parsedText = Array.isArray(result.text) ? result.text.join("\n\n") : result.text;
          } catch (parseErr) {
            throw new Error(
              `Failed to parse PDF: ${parseErr instanceof Error ? parseErr.message : "unknown"}`,
            );
          }

          if (!parsedText.trim()) {
            throw new Error("No text content found in PDF");
          }

          emit("scrape_progress", { status: "normalizing", contentLength: parsedText.length });

          // Normalize the parsed text
          const candidate = await normalizeCandidate({
            text: parsedText,
            model: "haiku",
          });

          emit("scrape_complete", {
            candidate,
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
