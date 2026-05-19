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
          emit("scrape_progress", { status: "parsing_pdf", fileName: file.name });

          const buf = new Uint8Array(await file.arrayBuffer());
          const contentHash = createHash("sha256").update(buf).digest("hex");

          // Parse text up front — fail fast if the PDF is unreadable.
          let parsedText = "";
          try {
            const pdf = await getDocumentProxy(buf);
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

          // Save the binary + create an attachment row with candidate_id=null.
          // The scraper-shell will link this attachment to the new candidate
          // after createCandidate succeeds. Orphan attachments (user scraped
          // but never saved) are accepted — cheap and easy to GC later.
          emit("scrape_progress", { status: "storing_pdf" });

          const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const storagePath = `org/${ORG_ID}/pending/${contentHash}-${safeName}`;
          const admin = createAdminClient();
          const { error: uploadErr } = await admin.storage
            .from("cvs")
            .upload(storagePath, buf, {
              contentType: file.type || "application/pdf",
              upsert: true, // re-uploading the same content is fine
            });
          if (uploadErr) {
            throw new Error(`Storage upload failed: ${uploadErr.message}`);
          }

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
