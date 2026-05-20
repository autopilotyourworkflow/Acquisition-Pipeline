import { createAdminClient } from "@/lib/supabase/admin";
import { createShortLink } from "@/lib/short-links";

/**
 * Single source of truth for "what CV link goes into a candidate's interview
 * invite?" Used by BOTH the create path (POST /api/interviews) and the
 * reschedule path (PATCH /api/interviews/[id]).
 *
 * History: the create path was wrapping the signed Supabase URL with
 * createShortLink so the calendar invite description stayed legible. The
 * reschedule path had its own inlined copy that forgot to do that, and the
 * regression went unnoticed until a reviewer saw a 400-character signed URL
 * in their rescheduled invite. Pulling both paths through this helper makes
 * it physically impossible for a future module to ship a long URL by
 * accident — there's only one function to call.
 *
 * Returns `null` if the candidate has no CV attachment, or if the signed
 * URL couldn't be minted. Returns a short `/l/<slug>` URL on success.
 * Falls back to the long signed URL only if the shortener itself fails
 * (still acceptable — the link works, just looks ugly).
 */
export async function getCandidateCvInviteUrl({
  candidateId,
  userId,
  ttlSeconds,
}: {
  candidateId: string;
  userId: string;
  ttlSeconds: number;
}): Promise<string | null> {
  const admin = createAdminClient();

  const { data: latestAttachment } = await admin
    .from("attachments")
    .select("storage_path")
    .eq("candidate_id", candidateId)
    .eq("kind", "cv_pdf")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestAttachment) return null;

  const { data: signed } = await admin.storage
    .from("cvs")
    .createSignedUrl(latestAttachment.storage_path as string, ttlSeconds);

  if (!signed?.signedUrl) return null;

  try {
    const short = await createShortLink({
      url: signed.signedUrl,
      ttlSeconds,
      userId,
    });
    return short.shortUrl;
  } catch (shortErr) {
    // Shortener regressions shouldn't make CVs un-shareable — fall back to
    // the long URL. Log so Vercel surfaces the issue.
    console.error(
      "[cv-link] short-link mint failed, falling back to long URL:",
      shortErr instanceof Error ? shortErr.message : shortErr,
    );
    return signed.signedUrl;
  }
}
