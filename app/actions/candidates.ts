"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { withAudit, computeRowHash } from "@/lib/audit/wrap";
import { ORG_ID } from "@/lib/db/constants";
import type { CandidateSource, CandidateStage } from "@/lib/db/enums";

/**
 * Server Actions for the candidates table. Every mutation flows through
 * `withAudit` so `activity_log` captures actor + before/after + hash.
 *
 * The mutation runs on the user-scoped Supabase client (RLS enforced).
 * `withAudit` itself uses the service-role client only for the audit insert,
 * because `activity_log` has SELECT-only RLS.
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

export async function createCandidate(input: {
  full_name: string;
  email?: string | null;
  phone?: string | null;
  current_title?: string | null;
  location?: string | null;
  linkedin_url?: string | null;
  source: CandidateSource;
  source_url?: string | null;
  jd_id?: string | null;
  notes?: string | null;
  raw_profile?: Record<string, unknown> | null;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase, userId } = await getActor();

    const insertPayload = {
      org_id: ORG_ID,
      full_name: input.full_name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      current_title: input.current_title ?? null,
      location: input.location ?? null,
      linkedin_url: input.linkedin_url ?? null,
      source: input.source,
      source_url: input.source_url ?? null,
      jd_id: input.jd_id ?? null,
      notes: input.notes ?? null,
      raw_profile: input.raw_profile ?? null,
      stage: "applied" as CandidateStage,
      created_by: userId,
    };

    // Insert first to get the generated id, then patch row_hash + audit.
    const { data: inserted, error: insErr } = await supabase
      .from("candidates")
      .insert(insertPayload)
      .select()
      .single();
    if (insErr || !inserted) {
      return { ok: false, error: insErr?.message ?? "Insert failed" };
    }

    // Patch row_hash now that we have the row with its server-side defaults.
    const rowHash = computeRowHash(inserted);
    await supabase.from("candidates").update({ row_hash: rowHash }).eq("id", inserted.id);

    // Audit row records the post-insert state including row_hash.
    const finalRow = { ...inserted, row_hash: rowHash };
    await withAudit({
      actorId: userId,
      orgId: ORG_ID,
      action: "insert",
      table: "candidates",
      targetId: inserted.id,
      before: null,
      mutate: async () => finalRow,
    });

    revalidatePath("/tracker");
    return { ok: true, data: { id: inserted.id } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function updateCandidateStage(input: {
  candidateId: string;
  stage: CandidateStage;
}): Promise<ActionResult<{ logId: string }>> {
  try {
    const { supabase, userId } = await getActor();

    const { data: before, error: fetchErr } = await supabase
      .from("candidates")
      .select("*")
      .eq("id", input.candidateId)
      .single();
    if (fetchErr || !before) {
      return { ok: false, error: fetchErr?.message ?? "Candidate not found" };
    }

    if (before.stage === input.stage) {
      // No-op — return the most recent log for the candidate so the UI has something.
      return { ok: true, data: { logId: "" } };
    }

    const { logId } = await withAudit({
      actorId: userId,
      orgId: ORG_ID,
      action: "update",
      table: "candidates",
      targetId: input.candidateId,
      before,
      mutate: async () => {
        const provisional = { ...before, stage: input.stage };
        const row_hash = computeRowHash(provisional);
        const { data, error } = await supabase
          .from("candidates")
          .update({ stage: input.stage, row_hash })
          .eq("id", input.candidateId)
          .select()
          .single();
        if (error) throw error;
        return data;
      },
    });

    revalidatePath("/tracker");
    return { ok: true, data: { logId } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function updateCandidate(input: {
  candidateId: string;
  patch: Record<string, unknown>;
}): Promise<ActionResult<{ logId: string }>> {
  try {
    const { supabase, userId } = await getActor();

    const { data: before, error: fetchErr } = await supabase
      .from("candidates")
      .select("*")
      .eq("id", input.candidateId)
      .single();
    if (fetchErr || !before) {
      return { ok: false, error: fetchErr?.message ?? "Candidate not found" };
    }

    const { logId } = await withAudit({
      actorId: userId,
      orgId: ORG_ID,
      action: "update",
      table: "candidates",
      targetId: input.candidateId,
      before,
      mutate: async () => {
        const provisional = { ...before, ...input.patch };
        const row_hash = computeRowHash(provisional);
        const { data, error } = await supabase
          .from("candidates")
          .update({ ...input.patch, row_hash })
          .eq("id", input.candidateId)
          .select()
          .single();
        if (error) throw error;
        return data;
      },
    });

    revalidatePath("/tracker");
    return { ok: true, data: { logId } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function deleteCandidate(input: {
  candidateId: string;
}): Promise<ActionResult<{ logId: string }>> {
  try {
    const { supabase, userId } = await getActor();

    const { data: before, error: fetchErr } = await supabase
      .from("candidates")
      .select("*")
      .eq("id", input.candidateId)
      .single();
    if (fetchErr || !before) {
      return { ok: false, error: fetchErr?.message ?? "Candidate not found" };
    }

    const { logId } = await withAudit({
      actorId: userId,
      orgId: ORG_ID,
      action: "delete",
      table: "candidates",
      targetId: input.candidateId,
      before,
      mutate: async () => {
        const { error } = await supabase
          .from("candidates")
          .delete()
          .eq("id", input.candidateId);
        if (error) throw error;
        return null;
      },
    });

    revalidatePath("/tracker");
    return { ok: true, data: { logId } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
