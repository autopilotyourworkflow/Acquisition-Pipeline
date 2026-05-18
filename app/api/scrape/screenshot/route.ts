import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeCandidate } from "@/lib/scrape/normalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ScrapeScreenshotRequest {
  fileUrl: string;
}

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  try {
    const { fileUrl } = (await req.json()) as ScrapeScreenshotRequest;

    if (!fileUrl) {
      return NextResponse.json({ error: "File URL is required" }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const responseStream = new ReadableStream({
      async start(controller) {
        const emit = (event: string, data: unknown) =>
          controller.enqueue(encoder.encode(sseEvent(event, data)));

        try {
          emit("scrape_progress", { status: "downloading_image", fileUrl });

          // Download the image from Supabase Storage
          const supabase = await createAdminClient();
          const { data: fileData, error: downloadErr } = await supabase.storage
            .from("screenshots")
            .download(fileUrl);

          if (downloadErr || !fileData) {
            throw new Error(`Failed to download image: ${downloadErr?.message || "Unknown error"}`);
          }

          // Convert to base64 for Claude API
          const base64Image = Buffer.from(await fileData.arrayBuffer()).toString("base64");

          emit("scrape_progress", { status: "analyzing_with_vision" });

          // Use the anthropic client directly for vision analysis
          const Anthropic = (await import("@anthropic-ai/sdk")).default;
          const client = new Anthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
          });

          const visionResponse = await client.messages.create({
            model: "claude-opus-4-7",
            max_tokens: 2048,
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "image",
                    source: {
                      type: "base64",
                      media_type: "image/png",
                      data: base64Image,
                    },
                  },
                  {
                    type: "text",
                    text: `Analyze this screenshot of a professional profile. Extract all visible candidate information:
- Full name
- Email address
- Phone number
- Current job title
- Location
- LinkedIn URL (if visible)
- Professional skills (list them)
- Work experience (company, title, dates, description)
- Education (institution, degree, field, graduation year)

Format your response as plain text with clear sections.`,
                  },
                ],
              },
            ],
          });

          // Extract the text from the vision response
          const visionText = visionResponse.content
            .filter((block) => block.type === "text")
            .map((block) => (block as any).text)
            .join("\n");

          emit("scrape_progress", { status: "normalizing" });

          // Normalize the extracted text
          const candidate = await normalizeCandidate({
            text: visionText,
            model: "haiku",
          });

          emit("scrape_complete", {
            candidate,
            sourceUrl: fileUrl,
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
