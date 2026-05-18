"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { withAudit } from "@/lib/audit/wrap";
import { ORG_ID } from "@/lib/db/constants";

type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

async function getActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return { supabase, userId: user.id };
}

/**
 * Auto-bump the version label. If existing versions follow the `scoring.vN`
 * convention, returns `scoring.v<N+1>`. Otherwise returns the current ISO
 * timestamp slug.
 */
function nextVersion(existing: string[]): string {
  const re = /^scoring\.v(\d+)$/;
  let max = 0;
  for (const v of existing) {
    const m = re.exec(v);
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  if (max > 0) return `scoring.v${max + 1}`;
  return `scoring.v${Date.now()}`;
}

/**
 * Save the persona text as a new scoring prompt version and mark it active.
 * Old prompts stay in the table for traceability — `scores.prompt_version`
 * keeps pointing to whichever version produced each row.
 */
export async function saveScoringPrompt(input: {
  personaText: string;
}): Promise<ActionResult<{ version: string; id: string }>> {
  try {
    const { userId } = await getActor();
    const admin = createAdminClient();

    const persona = input.personaText.trim();
    if (persona.length < 50) {
      return {
        ok: false,
        error: "Persona text seems too short — scoring quality depends on it. Please write at least a few sentences.",
      };
    }

    const { data: existingRows, error: listErr } = await admin
      .from("scoring_prompts")
      .select("version")
      .eq("org_id", ORG_ID);
    if (listErr) return { ok: false, error: listErr.message };

    const version = nextVersion((existingRows ?? []).map((r) => r.version as string));

    // Two-step: deactivate the current active row (so the partial unique
    // index doesn't reject the insert), then insert the new active row.
    await admin
      .from("scoring_prompts")
      .update({ is_active: false })
      .eq("org_id", ORG_ID)
      .eq("is_active", true);

    const { data: inserted, error: insertErr } = await admin
      .from("scoring_prompts")
      .insert({
        org_id: ORG_ID,
        version,
        persona_text: persona,
        is_active: true,
        created_by: userId,
      })
      .select()
      .single();

    if (insertErr || !inserted) {
      return { ok: false, error: insertErr?.message ?? "Insert failed" };
    }

    await withAudit({
      actorId: userId,
      orgId: ORG_ID,
      action: "insert",
      table: "scoring_prompts",
      targetId: inserted.id,
      before: null,
      mutate: async () => inserted,
    });

    revalidatePath("/settings/prompts");
    return { ok: true, data: { version, id: inserted.id } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function activateScoringPrompt(input: {
  promptId: string;
}): Promise<ActionResult<void>> {
  try {
    const { userId } = await getActor();
    const admin = createAdminClient();

    const { data: target, error: fetchErr } = await admin
      .from("scoring_prompts")
      .select("*")
      .eq("id", input.promptId)
      .single();
    if (fetchErr || !target) return { ok: false, error: fetchErr?.message ?? "Not found" };

    await admin
      .from("scoring_prompts")
      .update({ is_active: false })
      .eq("org_id", ORG_ID)
      .eq("is_active", true);

    const { data: updated, error: updateErr } = await admin
      .from("scoring_prompts")
      .update({ is_active: true })
      .eq("id", input.promptId)
      .select()
      .single();
    if (updateErr || !updated) return { ok: false, error: updateErr?.message ?? "Activate failed" };

    await withAudit({
      actorId: userId,
      orgId: ORG_ID,
      action: "update",
      table: "scoring_prompts",
      targetId: input.promptId,
      before: target,
      mutate: async () => updated,
    });

    revalidatePath("/settings/prompts");
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
