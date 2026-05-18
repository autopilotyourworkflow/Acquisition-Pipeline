import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ORG_ID } from "@/lib/db/constants";

/**
 * POST /api/attachments/upload (multipart/form-data)
 *   fields: candidateId (uuid), file (PDF)
 *
 * Dedup flow:
 *   1. Hash the file bytes (sha256).
 *   2. Check if this candidate already has an attachment with the same hash.
 *   3. If yes: return the cached attachment id + parsed_text length. Zero
 *      bytes uploaded, zero tokens spent, zero pdf-parsing CPU.
 *   4. If no: upload to Storage, parse via unpdf, insert attachment row with
 *      content_hash so the next identical upload short-circuits here.
 */
export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024;

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
  const contentHash = createHash("sha256").update(buf).digest("hex");

  // Dedup: if this candidate already has an attachment with the same content
  // hash, reuse it — no upload, no parse, no cost.
  const { data: existing } = await supabase
    .from("attachments")
    .select("id, parsed_text")
    .eq("candidate_id", candidateId)
    .eq("content_hash", contentHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({
      ok: true,
      attachmentId: existing.id,
      parsedTextLength: (existing.parsed_text as string | null)?.length ?? 0,
      reused: true,
    });
  }

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

  const admin = createAdminClient();
  const storagePath = `org/${ORG_ID}/candidate/${candidateId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error: uploadErr } = await admin.storage
    .from("cvs")
    .upload(storagePath, buf, {
      contentType: file.type || "application/pdf",
      upsert: false,
    });
  if (uploadErr) {
    return NextResponse.json(
      { error: `Storage upload failed: ${uploadErr.message}` },
      { status: 500 },
    );
  }

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
      content_hash: contentHash,
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
    reused: false,
  });
}
