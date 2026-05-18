"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { withAudit } from "@/lib/audit/wrap";
import { ORG_ID } from "@/lib/db/constants";

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

export async function createJd(input: {
  title: string;
  department?: string | null;
  location?: string | null;
  body_markdown: string;
  must_have: string[];
  nice_to_have: string[];
  threshold?: number;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const { supabase, userId } = await getActor();

    const { data: inserted, error } = await supabase
      .from("job_descriptions")
      .insert({
        org_id: ORG_ID,
        title: input.title,
        department: input.department ?? null,
        location: input.location ?? null,
        body_markdown: input.body_markdown,
        must_have: input.must_have,
        nice_to_have: input.nice_to_have,
        threshold: input.threshold ?? 7.0,
        created_by: userId,
      })
      .select()
      .single();

    if (error || !inserted) {
      return { ok: false, error: error?.message ?? "Insert failed" };
    }

    await withAudit({
      actorId: userId,
      orgId: ORG_ID,
      action: "insert",
      table: "job_descriptions",
      targetId: inserted.id,
      before: null,
      mutate: async () => inserted,
    });

    revalidatePath("/jds");
    revalidatePath("/tracker");
    return { ok: true, data: { id: inserted.id } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function updateJd(input: {
  jdId: string;
  patch: Partial<{
    title: string;
    department: string | null;
    location: string | null;
    body_markdown: string;
    must_have: string[];
    nice_to_have: string[];
    threshold: number;
  }>;
}): Promise<ActionResult<{ logId: string }>> {
  try {
    const { supabase, userId } = await getActor();

    const { data: before, error: fetchErr } = await supabase
      .from("job_descriptions")
      .select("*")
      .eq("id", input.jdId)
      .single();
    if (fetchErr || !before) {
      return { ok: false, error: fetchErr?.message ?? "JD not found" };
    }

    const { logId } = await withAudit({
      actorId: userId,
      orgId: ORG_ID,
      action: "update",
      table: "job_descriptions",
      targetId: input.jdId,
      before,
      mutate: async () => {
        const { data, error } = await supabase
          .from("job_descriptions")
          .update(input.patch)
          .eq("id", input.jdId)
          .select()
          .single();
        if (error) throw error;
        return data;
      },
    });

    revalidatePath("/jds");
    revalidatePath(`/jds/${input.jdId}`);
    revalidatePath("/tracker");
    return { ok: true, data: { logId } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function deleteJd(input: { jdId: string }): Promise<ActionResult<{ logId: string }>> {
  try {
    const { supabase, userId } = await getActor();

    const { data: before, error: fetchErr } = await supabase
      .from("job_descriptions")
      .select("*")
      .eq("id", input.jdId)
      .single();
    if (fetchErr || !before) {
      return { ok: false, error: fetchErr?.message ?? "JD not found" };
    }

    const { logId } = await withAudit({
      actorId: userId,
      orgId: ORG_ID,
      action: "delete",
      table: "job_descriptions",
      targetId: input.jdId,
      before,
      mutate: async () => {
        const { error } = await supabase
          .from("job_descriptions")
          .delete()
          .eq("id", input.jdId);
        if (error) throw error;
        return null;
      },
    });

    revalidatePath("/jds");
    revalidatePath("/tracker");
    return { ok: true, data: { logId } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

export async function createJdAndRedirect(input: {
  title: string;
  department?: string | null;
  location?: string | null;
  body_markdown: string;
  must_have: string[];
  nice_to_have: string[];
  threshold?: number;
}) {
  const result = await createJd(input);
  if (!result.ok) throw new Error(result.error);
  redirect(`/jds/${result.data.id}`);
}
