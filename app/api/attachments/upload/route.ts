import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ORG_ID } from "@/lib/db/constants";

/**
 * POST /api/attachments/upload (multipart/form-data)
 *   fields: candidateId (uuid), file (PDF)
 *
 * Uploads the PDF to the `cvs` Supabase Storage bucket, parses text via unpdf,
 * caches `parsed_text` on the attachments row so re-scoring the same CV
 * against a different JD doesn't re-parse.
 */
export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB cap

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const formData = await req.formData();
  const candidateId = formData.get("candidateId");
  const file = formData.get("file");
  if (typeof candidateId !== "string" || !candidateId) {
    return NextResponse.json({ error: "candidateId is required" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 8MB)" }, { status: 413 });
  }

  // Verify candidate exists + visible to this user (RLS will block otherwise).
  const { data: candidate, error: cErr } = await supabase
    .from("candidates")
    .select("id")
    .eq("id", candidateId)
    .single();
  if (cErr || !candidate) {
    return NextResponse.json(
      { error: cErr?.message ?? "Candidate not found" },
      { status: 404 },
    );
  }

  const buf = new Uint8Array(await file.arrayBuffer());

  // Parse the PDF text with unpdf.
  let parsedText = "";
  try {
    const pdf = await getDocumentProxy(buf);
    const result = await extractText(pdf, { mergePages: true });
    parsedText = Array.isArray(result.text) ? result.text.join("\n\n") : result.text;
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to parse PDF: ${err instanceof Error ? err.message : "unknown"}`,
      },
      { status: 422 },
    );
  }

  // Upload to Supabase Storage.
  const admin = createAdminClient();
  const storagePath = `org/${ORG_ID}/candidate/${candidateId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error: uploadErr } = await admin.storage
    .from("cvs")
    .upload(storagePath, buf, {
      contentType: file.type || "application/pdf",
      upsert: false,
    });
  if (uploadErr) {
    return NextResponse.json({ error: `Storage upload failed: ${uploadErr.message}` }, { status: 500 });
  }

  // Insert the attachments row with parsed_text cached.
  const { data: attachment, error: insertErr } = await supabase
    .from("attachments")
    .insert({
      org_id: ORG_ID,
      candidate_id: candidateId,
      kind: "cv_pdf",
      storage_path: storagePath,
      mime_type: file.type || "application/pdf",
      bytes: file.size,
      parsed_text: parsedText,
    })
    .select("id")
    .single();
  if (insertErr || !attachment) {
    return NextResponse.json(
      { error: `Attachment insert failed: ${insertErr?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    attachmentId: attachment.id,
    parsedTextLength: parsedText.length,
  });
}
