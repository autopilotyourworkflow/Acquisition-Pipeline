import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { normalizeCandidate } from "@/lib/scrape/normalize";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ORG_ID } from "@/lib/db/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest) {
  try {
    // Require auth: we're going to write to storage + the attachments table.
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

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
          // 1. Read the file once into an ArrayBuffer. We hash from this and
          // pass a FRESH Uint8Array view to pdfjs for parsing (pdfjs has a
          // history of retaining/transferring buffers — burning a copy is
          // cheaper than corrupting the upload).
          const arrayBuffer = await file.arrayBuffer();
          const hashBuf = new Uint8Array(arrayBuffer);
          const contentHash = createHash("sha256").update(hashBuf).digest("hex");

          // 2. Upload FIRST, passing the File object directly so the Supabase
          // SDK handles the stream cleanly. Use a unique timestamped path so
          // we never depend on upsert behavior.
          //    This must happen before pdfjs sees the bytes — if we parse
          //    first and the library retains the buffer, the upload silently
          //    sends garbage and Edge's viewer ends up with "We can't open
          //    this file."
          emit("scrape_progress", { status: "storing_pdf" });

          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const storagePath = `org/${ORG_ID}/pending/${Date.now()}-${contentHash}-${safeName}`;
          const admin = createAdminClient();
          const { error: uploadErr } = await admin.storage
            .from("cvs")
            .upload(storagePath, file, {
              contentType: file.type || "application/pdf",
              upsert: false,
            });
          if (uploadErr) {
            throw new Error(`Storage upload failed: ${uploadErr.message}`);
          }

          // 3. Now parse text from a fresh copy of the bytes — safe to do
          // anything pdfjs wants with this since the upload is already done.
          emit("scrape_progress", { status: "parsing_pdf", fileName: file.name });
          let parsedText = "";
          try {
            const parseBuf = new Uint8Array(arrayBuffer.slice(0));
            const pdf = await getDocumentProxy(parseBuf);
            const result = await extractText(pdf, { mergePages: true });
            parsedText = Array.isArray(result.text)
              ? result.text.join("\n\n")
              : result.text;
          } catch (parseErr) {
            throw new Error(
              `Failed to parse PDF: ${parseErr instanceof Error ? parseErr.message : "unknown"}`,
            );
          }

          if (!parsedText.trim()) {
            throw new Error("No text content found in PDF");
          }

          // 4. Create the attachment row (candidate_id=null — claimed on save).
          const { data: attachment, error: insertErr } = await supabase
            .from("attachments")
            .insert({
              org_id: ORG_ID,
              candidate_id: null,
              kind: "cv_pdf",
              storage_path: storagePath,
              mime_type: file.type || "application/pdf",
              bytes: file.size,
              parsed_text: parsedText,
              content_hash: contentHash,
            })
            .select("id")
            .single();
          if (insertErr || !attachment) {
            throw new Error(
              `Attachment insert failed: ${insertErr?.message ?? "unknown"}`,
            );
          }

          emit("scrape_progress", {
            status: "normalizing",
            contentLength: parsedText.length,
          });

          const candidate = await normalizeCandidate({
            text: parsedText,
            model: "haiku",
          });

          emit("scrape_complete", {
            candidate,
            attachmentId: attachment.id,
            fileName: file.name,
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
