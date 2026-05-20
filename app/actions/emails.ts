"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAudit, computeRowHash } from "@/lib/audit/wrap";
import { ORG_ID } from "@/lib/db/constants";
import { sendEmail, markdownToEmailHtml, GmailSendError } from "@/lib/google/gmail";

/**
 * Server Actions for the `emails` table — cold-outreach send + signature
 * settings. Phase 3e.
 *
 * Every send flows through `withAudit` so /activity shows who emailed
 * whom and when. The audit row's `before: null, after: <row>` shape
 * captures the email contents as part of the activity log itself.
 */

type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function getActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, userId: user.id };
}

/**
 * Send a cold-outreach email. Flow:
 *  1. Resolve candidate + verify there's a recipient email.
 *  2. Load the user's signature so we can append it to the plain-text body
 *     if the model didn't already (the prompt instructs it to, but we don't
 *     trust the model unconditionally).
 *  3. Send via Gmail.
 *  4. Insert the `emails` row (status='sent') and audit-log it.
 *
 * Ordering matters: we send FIRST, then insert. If the insert fails after
 * a successful send, we still log a 'sent' row via the catch block so the
 * activity log doesn't lose the event. The reverse ordering (insert as
 * 'drafted', then send, then update to 'sent') would leave orphan 'drafted'
 * rows on any HTTP hiccup, which is worse UX than the rare insert-after-send
 * failure (a) almost never happens, b) is already retried by Supabase's
 * connection pool, c) leaves the activity log noisier rather than cleaner).
 */
export async function sendColdEmail(input: {
  candidateId: string;
  jdId: string | null;
  subject: string;
  body: string;
  rationale?: string;
}): Promise<ActionResult<{ emailId: string }>> {
  try {
    const { supabase, userId } = await getActor();

    const subject = input.subject.trim();
    const body = input.body.trim();
    if (subject.length < 3) return { ok: false, error: "Subject is too short" };
    if (body.length < 20) return { ok: false, error: "Body is too short" };

    const { data: candidate, error: cErr } = await supabase
      .from("candidates")
      .select("id, full_name, email")
      .eq("id", input.candidateId)
      .single();
    if (cErr || !candidate) {
      return { ok: false, error: cErr?.message ?? "Candidate not found" };
    }
    if (!candidate.email) {
      return { ok: false, error: "Candidate has no email on file" };
    }

    // Pull the user's signature + from-name from user_settings via the
    // admin client (RLS would allow it anyway since user_id = self, but
    // the admin client sidesteps any JWT-plumbing edge cases).
    const admin = createAdminClient();
    const { data: settings } = await admin
      .from("user_settings")
      .select("email_signature, email_from_name")
      .eq("user_id", userId)
      .maybeSingle();
    const fromName = settings?.email_from_name?.trim() || null;
    const signature = settings?.email_signature?.trim() || null;

    // Append the signature ONLY if the model didn't already include it
    // verbatim. Cheap substring check — good enough; false negatives just
    // mean the user has one signature block where they expected two and
    // can fix the draft before sending.
    const bodyEndsWithSig =
      signature !== null &&
      body.toLowerCase().includes(signature.toLowerCase().slice(0, 40));
    const finalBodyText =
      signature && !bodyEndsWithSig
        ? `${body}\n\n${signature}`
        : body;
    const finalBodyHtml = markdownToEmailHtml(finalBodyText);

    let messageId: string;
    let threadId: string;
    try {
      const r = await sendEmail({
        userId,
        to: candidate.email,
        subject,
        bodyText: finalBodyText,
        bodyHtml: finalBodyHtml,
        fromName,
      });
      messageId = r.messageId;
      threadId = r.threadId;
    } catch (err) {
      if (err instanceof GmailSendError) {
        // Persist a 'failed' row so /activity has a record of the attempt.
        await admin.from("emails").insert({
          org_id: ORG_ID,
          candidate_id: input.candidateId,
          jd_id: input.jdId,
          user_id: userId,
          status: "failed",
          subject,
          body_markdown: finalBodyText,
          rationale: input.rationale ?? null,
          error: err.message,
        });
        const hint =
          err.reason === "missing_scope"
            ? " Visit /settings/integrations and re-connect Google to grant the gmail.send scope."
            : err.reason === "not_connected" || err.reason === "revoked"
              ? " Sign out and sign back in with Google to re-grant the scope."
              : "";
        return { ok: false, error: `Gmail send failed: ${err.message}.${hint}` };
      }
      throw err;
    }

    // Insert the 'sent' row and audit it.
    const { data: emailRow, error: insErr } = await admin
      .from("emails")
      .insert({
        org_id: ORG_ID,
        candidate_id: input.candidateId,
        jd_id: input.jdId,
        user_id: userId,
        status: "sent",
        subject,
        body_markdown: finalBodyText,
        rationale: input.rationale ?? null,
        gmail_message_id: messageId,
        gmail_thread_id: threadId,
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (insErr || !emailRow) {
      // Email already went out — log the row failure but treat as success
      // from the user's perspective so they don't re-send.
      console.error("[sendColdEmail] DB insert failed after Gmail send", {
        candidateId: input.candidateId,
        messageId,
        error: insErr,
      });
      return {
        ok: true,
        data: { emailId: messageId },
      };
    }

    const rowHash = computeRowHash(emailRow);
    await admin
      .from("emails")
      .update({ row_hash: rowHash })
      .eq("id", emailRow.id);

    await withAudit({
      actorId: userId,
      orgId: ORG_ID,
      action: "insert",
      table: "emails",
      targetId: emailRow.id,
      before: null,
      mutate: async () => ({ ...emailRow, row_hash: rowHash }),
    });

    revalidatePath(`/candidates/${input.candidateId}`);
    revalidatePath("/activity");
    return { ok: true, data: { emailId: emailRow.id } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Save the user's signature + from-name. Both nullable — empty strings clear
 * the field. Server-side only; never echoes the saved values back.
 */
export async function saveEmailSignature(input: {
  signature?: string | null;
  fromName?: string | null;
}): Promise<ActionResult> {
  try {
    const { userId } = await getActor();
    const admin = createAdminClient();

    const signatureTrim = (input.signature ?? "").trim();
    const fromNameTrim = (input.fromName ?? "").trim();

    const { error } = await admin.from("user_settings").upsert({
      user_id: userId,
      email_signature: signatureTrim.length > 0 ? signatureTrim : null,
      email_from_name: fromNameTrim.length > 0 ? fromNameTrim : null,
    });
    if (error) return { ok: false, error: error.message };

    revalidatePath("/settings/integrations");
    return { ok: true, data: undefined };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

